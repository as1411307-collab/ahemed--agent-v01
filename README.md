# AHMED Agent (v0.1)

AHMED Agent is a monorepo that pairs a mobile client with a stateful Core API.  
The Core owns task state, tool execution, approval workflow, audit logging, and model interaction.

## Repository layout

- `apps/core` — Fastify + TypeScript + SQLite Core API
- `apps/mobile` — Expo mobile client
- `packages/contract` — shared request/response contract types

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create environment files:

   ```bash
   # macOS/Linux
   cp apps/core/.env.example apps/core/.env
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   ```powershell
   # Windows PowerShell
   Copy-Item apps/core/.env.example apps/core/.env
   Copy-Item apps/mobile/.env.example apps/mobile/.env
   ```

3. Fill required Core values in `apps/core/.env`:
   - `CORE_OWNER_ID`
   - `CORE_PAIRING_CODE` (recommended for first device enrollment)
   - `ANTHROPIC_API_KEY`
   - `MODEL_NAME`

4. Set the mobile API endpoint in `apps/mobile/.env`:
   - `EXPO_PUBLIC_CORE_URL=https://<your-secure-core-url>`

5. Run Core and mobile app:

   ```bash
   npm run core
   npm run mobile
   ```

## Validation commands

```bash
npm test
npm run typecheck
npm run typecheck -w @ahmed/mobile
npm run verify
```

## Key references

- `V0_CONTRACT.md` — source-of-truth API contract
- `docs/BUILD_PROMPT.md` — v0.1 scope constraints
- `docs/SECURITY_GATES_PHASE1.md` — security gate and deployment caveats
