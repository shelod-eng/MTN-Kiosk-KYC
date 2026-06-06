# WhatsApp Single-Screen Implementation Report

## Requirement Summary

The renewed client requirement is to keep the customer journey inside one WhatsApp-looking screen. Bulk ingestion remains functionally unchanged, while a single MSISDN from an MNO batch can be simulated as the starting point for the walk-in/customer flow.

## Implemented Flow

1. Mock one MNO-supplied MSISDN from a batch row.
2. Send OTP in the WhatsApp-style chat.
3. Verify OTP and move the case to `otp_approved`.
4. Treat OTP approval as active MSISDN verification and continue directly to customer details.
5. Ask only for full name and SA ID number. The verified MSISDN is reused.
6. Validate the SA ID number for 13 digits, date structure, citizenship digit, and checksum before continuing.
7. Attach a real browser-selected ID, driver's licence, or passport file and run OCR through the existing document endpoint.
8. Upload a real browser-selected proof-of-address file or type affidavit text directly in chat.
9. Capture selfie/liveness from the browser camera plus device fingerprint, GPS coordinates, nearest tower inference, and IP evidence.
10. Run final verification and show an inline report with CSV download.

## Developer Checklist Status

- OTP consent: implemented through `/api/whatsapp/otp/send` and `/api/whatsapp/otp/verify`.
- `otp_approved` status: added to the case lifecycle; OTP approval now confirms active MSISDN.
- Customer details: captured via `/api/whatsapp/webhook` without asking for phone number again.
- SA ID checksum: invalid IDs are rejected in chat and the customer is re-prompted until a valid 13-digit ID is supplied.
- ID document and OCR: reused `/api/whatsapp/session/[token]/document` with uploaded file data URLs.
- Device intelligence: reused `/api/whatsapp/session/[token]/device`.
- Selfie/liveness: reused `/api/whatsapp/biometrics/analyze`.
- GPS capture: reused `/api/whatsapp/session/[token]/location`; the endpoint also stores an inferred nearest tower ID.
- Address or affidavit: reused `/api/whatsapp/address/upload` with uploaded file data URLs and `/api/whatsapp/affidavit`.
- Affidavit AI reader: added simulated text scoring, extracted address, proof acceptance, and review reason.
- Final verification: added `/api/whatsapp/verification` for consolidated report and CSV output.
- WhatsApp UI: added `WhatsAppKycChatDemo` with green header, message bubbles, timestamps, attachment actions, input bar, and inline report.
- Bulk campaigns: left functionally unchanged.

## Local Test Flow

Open `http://localhost:3000`.

1. Click `Send OTP`.
2. Enter `123456`.
3. Enter `Lebohang Mpeta`.
4. Enter `8306125876089`.
5. Click `Upload ID / license / passport` and select a local ID, driver's licence, or passport file.
6. Type affidavit text or click `Upload proof document` and select a local proof-of-address file.
7. Click `Open camera + fingerprint`, allow camera/GPS, then click `Capture and verify`.
8. Click `Run final verification`.
9. Review the inline report and download the CSV.

## Verification

- `npm run build` passes.
- `npm run lint` is still blocked by the project missing an ESLint 9 `eslint.config.*` file.
