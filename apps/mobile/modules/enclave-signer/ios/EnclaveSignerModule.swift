import ExpoModulesCore
import CryptoKit
import Security

/// Unverified iOS/Xcode reference module. P-256 proof != remote hardware attestation.
public class EnclaveSignerModule: Module {
  private let service = "app.ahmed.agent.enclave-signer"
  // v1 remains untouched to prevent irreversible lockout during re-enrollment.
  private let account = "action-approval-key-v2-silent"
  private let prefix = "AHMED-ACTION-APPROVAL-V1\n"

  public func definition() -> ModuleDefinition {
    Name("EnclaveSigner")
    AsyncFunction("ensureHardwareKey") { () throws -> String in
      let encoded = try self.loadOrCreateRepresentation()
      let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: encoded)
      return key.publicKey.pemRepresentation
    }
    // Same non-exportable key. Separate domain prefixes stop a signed session
    // proof from being accepted as an action-approval signature.
    AsyncFunction("signChallengeBytes") { (bytes: String) throws -> String in
      let enrollmentPrefix = "AHMED-DEVICE-ENROLL-V1\n"
      let sessionPrefix = "AHMED-DEVICE-SESSION-V1\n"
      guard (bytes.hasPrefix(enrollmentPrefix) || bytes.hasPrefix(sessionPrefix)),
            bytes.utf8.count <= 8_192 else {
        throw NSError(domain: "AHMED_ENCLAVE", code: 400,
          userInfo: [NSLocalizedDescriptionKey: "Invalid device challenge"])
      }
      let encoded = try self.loadOrCreateRepresentation()
      let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: encoded)
      return try key.signature(for: Data(bytes.utf8)).derRepresentation.base64EncodedString()
    }
    AsyncFunction("signApprovalBytes") { (bytes: String) throws -> String in
      guard bytes.hasPrefix(self.prefix), bytes.utf8.count <= 70_000 else {
        throw NSError(domain: "AHMED_ENCLAVE", code: 400,
          userInfo: [NSLocalizedDescriptionKey: "Invalid approval envelope"])
      }
      let encoded = try self.loadOrCreateRepresentation()
      let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: encoded)
      return try key.signature(for: Data(bytes.utf8)).derRepresentation.base64EncodedString()
    }
  }

  private func loadOrCreateRepresentation() throws -> Data {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess {
      guard let data = item as? Data else {
        throw NSError(domain: "AHMED_ENCLAVE", code: 500)
      }
      return data
    }
    guard status == errSecItemNotFound else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
    guard SecureEnclave.isAvailable else {
      throw NSError(domain: "AHMED_ENCLAVE", code: 503)
    }
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
      nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      [.privateKeyUsage], &error
    ) else {
      throw error?.takeRetainedValue() as Error? ??
        NSError(domain: "AHMED_ENCLAVE", code: 500)
    }
    let key = try SecureEnclave.P256.Signing.PrivateKey(
      compactRepresentable: false, accessControl: access
    )
    let representation = key.dataRepresentation
    let newItem: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecValueData as String: representation,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    let insertStatus = SecItemAdd(newItem as CFDictionary, nil)
    guard insertStatus == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(insertStatus))
    }
    return representation
  }
}