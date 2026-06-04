# Bulk Campaign Processing

## Purpose

Network providers submit files of MSISDNs that are not yet RICA/FICA compliant. KYC-Now ingests the file, creates a WhatsApp KYC case per customer, tracks completion, and returns a provider report.

## Intake Flow

1. Provider places a CSV file on a secure FTP/SFTP location.
2. KYC-Now imports the file and creates a batch record with provider, file name, received timestamp, and row count.
3. Each valid row creates a WhatsApp KYC case in `consent_pending`.
4. Each customer receives a WhatsApp KYC link and completes the same secure flow as a walk-in customer.
5. KYC-Now tracks each case through consent, ID/OCR, selfie/liveness, OTP, address or affidavit, location, and final risk decision.
6. Provider receives a completion report for processed, approved, manual-review, rejected, failed, and pending cases.

## Minimum CSV Columns

- `msisdn` or `phoneNumber`
- `fullName` when available
- `idNumber` when available
- optional `campaignId`
- optional `segment`

## Batch Statuses

- `received`
- `validated`
- `processing`
- `completed`
- `completed_with_exceptions`
- `failed`

## Provider Report

The provider report should include:

- batch reference
- provider
- source file name
- MSISDN
- case reference
- final status
- final decision
- risk score
- missing items
- completed checks
- generated timestamp

## Production Notes

- Use SFTP with provider-specific folders and PGP-encrypted files.
- Store raw inbound files separately from normalized rows.
- Deduplicate by provider, MSISDN, and active campaign.
- Rate-limit WhatsApp sends per provider agreement.
- Return provider reports by SFTP drop-off and dashboard download.
