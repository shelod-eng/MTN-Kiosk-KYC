# WhatsApp KYC-Now Technical Specification

## Scope

This prototype extends the existing KYC demo into a WhatsApp-first onboarding flow for MTN, Vodacom, and Cell C staff-assisted initiation. The implementation focus is:

- staff-triggered case initiation
- consent and minimal personal data capture
- secure web-session handoff
- selfie/liveness and device/location capture scaffolding
- OTP and affidavit APIs
- weighted trust-layer risk scoring
- immutable audit trail patterns

## Delivery assumptions

- WhatsApp messaging provider will be integrated through a webhook-compatible gateway such as Twilio or Meta Cloud API.
- Supabase/Postgres is the target system of record, while the current prototype uses an in-memory store for local development.
- Biometric and location providers are represented through integration-ready API boundaries.

## Case lifecycle

1. Staff initiates a WhatsApp case and selects delivery method (`whatsapp` or `qr`).
2. Customer receives the WhatsApp trigger and submits consent.
3. Customer provides full name, SA ID number, and phone number.
4. Customer is redirected into a secure web session for selfie, device, and GPS capture.
5. OTP is sent and verified before final approval.
6. Customer provides proof of address or completes a fallback digital affidavit with video.
7. Risk engine evaluates the trust layers and returns `approved`, `manual_review`, or `rejected`.

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
