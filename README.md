# MTN-Kiosk-KYC

Functional kiosk and WhatsApp KYC prototype for South African onboarding flows.

## What is included

- A kiosk onboarding flow with personal details, ID upload, selfie upload fallback with liveness scoring, proof-of-address upload, and verification.
- A WhatsApp demo with guided messages, ID upload, selfie capture or upload, proof-of-address upload, and mock OCR extraction panels.
- A WhatsApp KYC-Now operations console with staff initiation, secure session links, OTP flow, affidavit fallback, location capture, and weighted trust-layer scoring.
- A drag-and-drop BPMN workflow builder powered by `bpmn-js`.
- Local workflow execution through `POST /api/workflow/execute` for KYC tasks such as OCR, selfie verification, DHA validation, TransUnion, Experian, and risk decisioning.
- Supporting mock APIs:
  - `GET /api/cases`
  - `POST /api/decision-preview`

## Runtime modes

- If `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured, WhatsApp cases persist through Supabase REST.
- If they are missing, the app falls back to in-memory persistence for local demo use.
- Runtime status is available at `GET /api/whatsapp/runtime-status`.

## What is still mocked

- DHA, TransUnion, and Experian live integrations
- Media storage, staff SSO, and row-level security hardening
- Real OCR processing and Camunda engine connectivity

## Run locally

Use `npm.cmd` in PowerShell if script execution blocks `npm`.

```bash
npm.cmd run dev
```

Then open `http://localhost:3000`.

Optional environment variables:

```bash
OTP_PROVIDER=mock
BIOMETRIC_PROVIDER=mock
WHAT3WORDS_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
WHATSAPP_SESSION_SECRET=
```

## Suggested next steps

1. Replace the local BPMN executor with a running Camunda-backed workflow service.
2. Add real OCR for ID and proof-of-address uploads.
3. Connect live DHA, TransUnion, and Experian APIs.
4. Persist cases, audits, and tenant configuration in Supabase.
