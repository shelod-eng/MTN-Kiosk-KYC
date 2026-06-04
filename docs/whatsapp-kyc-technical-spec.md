# WhatsApp KYC-Now Technical Specification

## Scope

This prototype extends the existing KYC demo into a WhatsApp-first onboarding flow for MTN, Vodacom, and Cell C staff-assisted initiation. The implementation focus is:

- staff-triggered case initiation
- consent and minimal personal data capture
- single-screen WhatsApp-style customer journey
- selfie/liveness and device/location capture scaffolding
- OTP and affidavit APIs
- weighted trust-layer risk scoring
- immutable audit trail patterns

## Delivery assumptions

- WhatsApp messaging provider will be integrated through a webhook-compatible gateway such as Twilio or Meta Cloud API.
- Supabase/Postgres is the target system of record, while the current prototype uses an in-memory store for local development.
- Biometric and location providers are represented through integration-ready API boundaries.

## Case lifecycle

1. MNO supplies a single MSISDN or a bulk file row.
2. KYC-Now sends WhatsApp OTP to the verified MSISDN.
3. Customer enters OTP and case moves from `consent_pending` to `otp_approved`.
4. Customer replies `START KYC` / consent in the same WhatsApp screen.
5. Customer provides full name and SA ID number. The MSISDN is not requested again.
6. Customer attaches ID document for OCR, captures selfie/liveness, and records device/GPS/IP evidence.
7. Customer uploads proof of address or submits free-text/scanned affidavit. No dropdown is required.
8. AI affidavit reader validates the affidavit text as proof-of-address fallback.
9. Risk engine evaluates the consolidated checks and returns an inline WhatsApp verification report with CSV export.

## Trust layers

The current implementation uses weighted layer scoring:

- name capture
- SA ID validation
- OTP verification
- liveness detection
- face match
- proof of address or digital affidavit
- GPS location and timestamp
- device intelligence
- provider tower residence zone where supplied by MNO batch files

## API surface implemented in prototype

- `GET /api/cases`
- `GET /api/whatsapp/cases`
- `POST /api/whatsapp/staff/initiate`
- `POST /api/whatsapp/webhook`
- `POST /api/whatsapp/biometrics/analyze`
- `GET /api/whatsapp/cases/[caseId]`
- `PATCH /api/whatsapp/cases/[caseId]/status`
- `POST /api/whatsapp/session/create`
- `GET /api/whatsapp/session/[token]`
- `POST /api/whatsapp/session/capture`
- `POST /api/whatsapp/otp/send`
- `POST /api/whatsapp/otp/verify`
- `POST /api/whatsapp/location/resolve`
- `POST /api/whatsapp/affidavit`
- `POST /api/whatsapp/risk-score`
- `POST /api/whatsapp/verification`

## Production follow-up

- replace in-memory store with Supabase repositories
- add signed media upload flow
- connect Twilio Verify or Netcash OTP
- integrate AWS Rekognition or FaceTec
- add reviewer queue and protected admin access
- harden audit retention and POPIA access controls

## Local environment

Use the following environment placeholders from `.env.example`:

- `OTP_PROVIDER`
- `BIOMETRIC_PROVIDER`
- `WHAT3WORDS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `WHATSAPP_SESSION_SECRET`
