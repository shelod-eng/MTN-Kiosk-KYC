# KYC-Now WhatsApp RICA/FICA Technical Spec

## Purpose

KYC-Now supports Mobile Network Operator RICA/FICA intake through a WhatsApp-style customer journey. The prototype supports both a single MSISDN and bulk MSISDN batches from MTN, Vodacom, and Cell C. The WhatsApp interface is a presentation layer only; core verification logic remains in the existing backend endpoints.

## Intake Modes

### Single MSISDN

1. Operator selects provider.
2. Operator enters one MSISDN.
3. Backend creates one `kyc_cases` record.
4. OTP is sent to the verified MSISDN.
5. Customer completes the WhatsApp KYC journey.
6. Final report is shown inline and exported as CSV.

### Bulk MSISDN Batch

1. Operator selects provider.
2. Operator pastes or uploads CSV.
3. Backend parses the file and creates one case per valid MSISDN.
4. Each queued case is isolated and can be opened independently.
5. Each case runs the same KYC flow as the single MSISDN journey.
6. Provider report is exported as CSV/JSON-ready output.

Prototype CSV supports MSISDN-only files:

```csv
phoneNumber
+27821234567
+27731234567
+27611234567
```

If `fullName` and `idNumber` are supplied, they are prefilled. If they are missing, the WhatsApp flow asks the customer for them.

## WhatsApp Customer Journey

1. `consent_pending`: case created.
2. `otp_pending`: OTP sent.
3. `otp_approved`: MSISDN verified.
4. Customer supplies full name.
5. Customer supplies SA ID; checksum validation must pass before continuing.
6. Customer uploads ID, driver's licence, or passport.
7. OCR endpoint stores ID document URL, document type, OCR confidence, and ID validation readiness.
8. Customer uploads proof of address or submits affidavit text.
9. Affidavit AI reader scores free-text affidavit evidence when used as fallback.
10. Customer captures selfie from browser camera.
11. Biometric endpoint stores liveness and face-match scores.
12. Device endpoint stores browser fingerprint, screen size, language, timezone, session continuity, cookies, and IP address.
13. Location endpoint stores GPS coordinates, What3Words, and inferred nearest tower ID.
14. Final verification endpoint returns inline report and downloadable CSV.

## Core API Surface

- `POST /api/whatsapp/staff/initiate`: create single case.
- `POST /api/whatsapp/bulk-campaigns`: parse CSV and create queued cases.
- `POST /api/whatsapp/otp/send`: send OTP.
- `POST /api/whatsapp/otp/verify`: verify OTP and move to `otp_approved`.
- `POST /api/whatsapp/webhook`: record consent/details/selfie workflow events.
- `POST /api/whatsapp/session/[token]/document`: upload ID document and run OCR simulation.
- `POST /api/whatsapp/session/[token]/device`: capture digital fingerprint and IP.
- `POST /api/whatsapp/session/[token]/location`: capture GPS, What3Words, and inferred tower.
- `POST /api/whatsapp/biometrics/analyze`: liveness and face match.
- `POST /api/whatsapp/address/upload`: proof-of-address upload.
- `POST /api/whatsapp/affidavit`: affidavit fallback and AI text scoring.
- `POST /api/whatsapp/verification`: consolidated risk decision and report CSV.
- `GET /api/whatsapp/queue`: BullMQ queue health and counts.
- `POST /api/whatsapp/queue`: enqueue OTP, case-stage, or verification-report jobs.

## Data Storage

Primary case state is stored in `kyc_cases` as a normalized row plus `case_payload`.

Supabase Row Level Security should remain enabled for KYC tables. Server-side API routes use `SUPABASE_SERVICE_ROLE_KEY` for protected writes, while `SUPABASE_ANON_KEY` remains the public/browser-safe key. The service-role key must only be configured in server environments such as `.env.local` and Vercel environment variables.

Important evidence fields:

- `gps_coordinates`
- `what3words_id`
- `tower_id`
- `location_evidence`
- `affidavit_video_url`
- `residence_evidence_captured_at`
- `risk_score`
- `risk_band`
- `decision`

Bulk records are stored in:

- `kyc_bulk_batches`
- `kyc_bulk_rows`

## Verification Logic

The final decision model evaluates:

- OTP verification
- full name capture
- SA ID validation
- ID OCR confidence
- selfie liveness
- face match
- proof of address or affidavit AI validation
- GPS and timestamp
- nearest tower residence zone
- device fingerprint and IP evidence

Decision outcomes:

- `approved`
- `manual_review`
- `rejected`

## Prototype Queue Model

Bulk cases are loaded into a UI queue. Selecting a queued MSISDN dispatches OTP and opens that case in the same WhatsApp journey.

This is intentionally queue-ready for production. BullMQ has been added as the Redis-backed queue engine for the production path.

Implemented queues:

- `otp_dispatch`
- `kyc_case`
- `verification_report`

Local commands:

```bash
npm run redis:local
npm run worker
```

See `docs/bullmq-setup.md` for queue setup, worker behavior, concurrency, retry, and Twilio integration guidance.

Alternative production schedulers still remain viable for specific needs:

- Supabase cron for scheduled SFTP polling and batch dispatch.
- Postgres queue table for lightweight queueing and audit-friendly processing.

## Twilio Production Path

Twilio WhatsApp Business will become the delivery bridge:

1. MNO submits single MSISDN or bulk file.
2. Backend creates case(s).
3. Queue dispatches WhatsApp template/OTP through Twilio.
4. Customer replies hit `/api/whatsapp/webhook`.
5. Backend advances each independent case.
6. Reports are returned to MNO by dashboard, CSV, JSON, or SFTP.

## Compliance Notes

- Each case is isolated by case ID and secure session token.
- Audit trail entries are appended throughout the case lifecycle.
- Uploaded files are represented as data URLs in the prototype; production should use signed object storage.
- POPIA/RICA/FICA production hardening should include retention policy, access controls, encryption, and reviewer workflow.

## Validation

Current prototype validation:

- `npm run build` passes.
- ESLint remains blocked until an ESLint 9 `eslint.config.*` file is added.
