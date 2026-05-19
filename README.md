# MTN-Kiosk-KYC

Functional kiosk and WhatsApp KYC prototype for South African onboarding flows.

## What is included

- A kiosk onboarding flow with personal details, ID upload, selfie upload fallback with liveness scoring, proof-of-address upload, and verification.
- A WhatsApp demo with guided messages, ID upload, selfie capture or upload, proof-of-address upload, and mock OCR extraction panels.
- A drag-and-drop BPMN workflow builder powered by `bpmn-js`.
- Local workflow execution through `POST /api/workflow/execute` for KYC tasks such as OCR, selfie verification, DHA validation, TransUnion, Experian, and risk decisioning.
- Supporting mock APIs:
  - `GET /api/cases`
  - `POST /api/decision-preview`

## What is still mocked

- DHA, TransUnion, and Experian live integrations
- Supabase persistence, storage, auth, and row-level security
- Real OCR processing and Camunda engine connectivity

## Run locally

Use `npm.cmd` in PowerShell if script execution blocks `npm`.

```bash
npm.cmd run dev
```

Then open `http://localhost:3000`.

## Suggested next steps

1. Replace the local BPMN executor with a running Camunda-backed workflow service.
2. Add real OCR for ID and proof-of-address uploads.
3. Connect live DHA, TransUnion, and Experian APIs.
4. Persist cases, audits, and tenant configuration in Supabase.
