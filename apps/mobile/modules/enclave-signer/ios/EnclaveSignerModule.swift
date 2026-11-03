import ExpoModulesCore
import CryptoKit
import LocalAuthentication
import Security

/// Unverified iOS/Xcode reference module. P-256 proof != remote hardware attestation.
public class EnclaveSignerModule: Module {
  private let service = "app.ahmed.agent.enclave-signer"
  private let account = "action-approval-key-v1"
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
      let enrollmentPrefix = "AHMED-DEVICE-ENROLL-V1\\n".replacingOccurrences(of: "\\\\n", with: "\\n")
      let sessionPrefix = "AHMED-DEVICE-SESSION-V1\\n".replacingOccurrences(of: "\\\\n", with: "\\n")
      guard (bytes.hasPrefix(enrollmentPrefix) || bytes.hasPrefix(sessionPrefix)),
            bytes.utf8.count <= 8_192 else {
        throw NSError(domain: "AHMED_ENCLAVE", code: 400,
          userInfo: [NSLocalizedDescriptionKey: "Invalid device challenge"])
      }
      let encoded = try self.loadOrCreateRepresentation()
      let auth = LAContext()
      auth.localizedReason = "Authenticate Ahmed Agent device"
      let key = try SecureEnclave.P256.Signing.PrivateKey(
        dataRepresentation: encoded, authenticationContext: auth
      )
      return try key.signature(for: Data(bytes.utf8)).derRepresentation.base64EncodedString()
    }
    AsyncFunction("signApprovalBytes") { (bytes: String) throws -> String in
      guard bytes.hasPrefix(self.prefix), bytes.utf8.count <= 70_000 else {
        throw NSError(domain: "AHMED_ENCLAVE", code: 400,
          userInfo: [NSLocalizedDescriptionKey: "Invalid approval envelope"])
      }
      let encoded = try self.loadOrCreateRepresentation()
      let auth = LAContext()
      auth.localizedReason = "Confirm an Ahmed Agent action"
      let key = try SecureEnclave.P256.Signing.PrivateKey(
        dataRepresentation: encoded, authenticationContext: auth
      )
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
      [.privateKeyUsage, .userPresence], &error
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