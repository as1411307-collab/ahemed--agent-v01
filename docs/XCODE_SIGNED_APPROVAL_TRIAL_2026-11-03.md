# Xcode iPhone signed-approval trial (3 November 2026)

> **DEMO / NO EXTERNAL EXECUTION**. This is a child branch of draft PR #7.
> Do **not** merge into `main`, expose Core on the public Internet, or enable
> action credentials. The signed-broker dispatcher returns a **DEMO_ONLY_NO_EFFECT**
> receipt. No real write tool can be executed from the signed route.

## What is wired

1. The existing React Native app now shows device pairing, its existing task
   approval card, and the already-created `ApprovalReview` screen.
2. Existing native `EnclaveSignerModule.swift` keeps the P-256 Secure Enclave key.
   It additionally signs two domain-separated device challenges with the **same**
   key; it does not export the private key or use a JavaScript fallback.
3. First enrollment requires a server-only high-entropy, one-use
   `CORE_PAIRING_CODE`, an owner-bound stored P-256 public key and a signed
   enrollment challenge. The pairing code is not bundled or retained in app
   storage. The server never accepts `ownerId` from the client as authority.
4. Every session requires a new P-256 signed nonce and returns a 5-minute
   randomly generated bearer token held **only in process memory**. Its hash
   is stored server-side, never the bearer itself.
5. Core routes validate the owner of every conversation and task. Legacy
   anonymous conversations cannot be silently claimed.
6. `signed-preview` derives a typed `ActionEnvelope` from a real pending
   action in the task database. `ApprovalReview` displays each actionable
   field plus the **complete canonical JSON** that gets signed.
7. Action Broker verifies the signature against the enrolled device, checks
   expiry and policy, reserves an action once in SQLite, then confirms only
   the mock/no-effect receipt. The original task remains pending.
8. The old `APPROVE` HTTP route returns 403 in signed-device mode. The
   ordinary `REJECT` route remains available to reject the original request.
   The `Revoke` button invalidates the device and all sessions.

## Build on your own Mac using Xcode and Apple Developer

This repository contains an Expo SDK 57 / React Native project. **You do not
need EAS Build or Expo Go**; Expo Prebuild generates the native Xcode workspace.
Keep the current app code and existing Secure Enclave module.

**Prerequisites:** macOS and a supported Xcode installation, Apple Developer
account signed into Xcode, CocoaPods, Node 22+ and an iPhone in Developer Mode.
Use a **physical iPhone** for enclave validation; simulator tests do not
establish genuine enclave signing.

```bash
git fetch origin
git switch security/iphone-signed-approval-trial-2026-11-03
npm ci
cd apps/mobile
# Adjust ios.bundleIdentifier in app.json if already registered or conflicting.
# Configure EXPO_PUBLIC_CORE_URL to your *private HTTPS Core endpoint*
# in apps/mobile/.env. Never set EXPO_PUBLIC_APP_TOKEN.
npx expo prebuild --platform ios
npx expo-modules-autolinking resolve --platform apple
open ios/*.xcworkspace
```

In **Xcode > Settings > Accounts**, select your Apple Developer account.
In the app target > **Signing & Capabilities**, choose your **Team** and
**Automatically manage signing**. Set a unique Bundle Identifier if prompted.
Select the physically connected iPhone as the run destination, Trust the Mac,
enable iPhone Developer Mode, and use **Product > Run** (Debug).

Check that generated Expo autolinking lists the `EnclaveSignerModule` and
that Xcode compiles `CryptoKit`, `LocalAuthentication` and `Security`.
If `EnclaveSigner` is absent, do not bypass the module with JavaScript signing.

Launch Metro while Xcode Debug is running:

```bash
cd apps/mobile
npx expo start --dev-client
```

Expo officially supports native development builds with Xcode, including
builds without the optional `expo-dev-client` launcher dependency. If you want
the full Expo development launcher, run `npx expo install expo-dev-client` on
your Mac, commit the resulting package and lockfile changes on a separate
reviewed branch, regenerate native files, and rebuild with Xcode.

**No Apple keys, account credentials, certificates, provisioning profiles or
device signing materials are stored in this repository.** Creating a project,
prebuild instructions and CI do not establish a successful Xcode build.

## Core trial setup

Use `apps/core/.env.example` for server-only configuration. Generate the
one-time pairing code locally with `openssl rand -base64 32`; paste it only in
the server's **uncommitted** `apps/core/.env` as `CORE_PAIRING_CODE`.
Use an owner identifier such as `owner-ahmed-0001` (not a secret).
Start the Core as a development-only process; the current production security
audit is **intentionally fail-closed** pending remote n8n and broker isolation.

The Core listens on `127.0.0.1` by default and must be exposed to the phone
only through a trusted restricted-access **HTTPS** reverse proxy. A plain
`http://192.168.*` address is rejected by the client: pairing codes, proofs
and session tokens must never cross unencrypted LAN HTTP.

The pairing code can enroll **one device once**. Revoking it prevents future
sessions, and it cannot be enrolled again using the consumed code. A reviewed
local administrative device-recovery and pairing-code rotation procedure is
still required; do not delete the action database simply to re-enroll.

## Test matrix and truthful evidence

| Test | Expected | Automated test | Xcode/physical iPhone |
|---|---|---|---|
| Wrong pairing code | 403 | yes | not verified |
| Device identity owner binding | server owner | yes | not verified |
| Wrong proof and challenge replay | 403 | yes | not verified |
| Legacy static bearer | 401 | yes | not verified |
| Legacy unsigned APPROVE | 403 | yes | not verified |
| Displayed JSON equals broker signed bytes | exact equality | yes | not verified |
| Tampered signed destination | 403 | yes | not verified |
| Valid signed preview | demo-only receipt | yes | not verified |
| Second use of approval | 403 | yes | not verified |
| Expired approval | 403 | yes | not verified |
| Rejected preview | 403 | yes | not verified |
| Revoked device/session | 401/403 | yes | not verified |
| Real Secure Enclave key & user presence | biometric/device auth | no | not verified |
| Native module links, builds and runs | Xcode successful | no | not verified |
| External side effects | none | no-op by design | blocked |

Automated tests use a software-generated P-256 test key to verify the
cryptographic protocol and HTTP integration. They do **not** prove that the
native signing key was created in Secure Enclave or that Face ID appeared.

To run software tests:

```bash
npm ci
npm test
npm run typecheck
npm run typecheck -w @ahmed/mobile
```

## Intentional production blockers

- Broker and Agent still share the same SQLite DB and process in this **trial**.
  This must not be treated as enforced credential/process isolation.
- Signed approvals produce only mock receipts; no tool dispatcher is enabled.
- Secure Enclave origin **is not remotely attested** by a P-256 signature.
  Production needs a separate app/device attestation and device recovery policy.
- Live n8n, MCP credentials, network egress, action broker OS isolation,
  tool bypass paths, action reconciliation and physical iPhone signing are
  **not yet verified**. `NODE_ENV=production` remains blocked.
- Secure Enclave Swift code requires an actual Xcode + iPhone build.
  No macOS build toolchain/device is attached to this task environment.
- This child branch should remain a draft PR with its base on PR #7's branch,
  not on `main`, until both reviews and hardware verification finish.
