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

- `fullName`
- `idNumber`
- `phoneNumber` or `msisdn`
- optional `campaignId`
- optional `segment`

The ingestion route normalizes South African mobile numbers to E.164 (`+27...`) and rejects rows where `idNumber` is not 13 digits. Full checksum and demographic validation continues in the downstream KYC details and risk stages.

## Batch Statuses

- `received`
- `validated`
- `processing`
- `completed`
- `completed_with_exceptions`
- `failed`

## Implemented Demo Flow

- Operators open the Bulk campaign CSV tab, choose MTN, Vodacom, or Cell C, paste/upload a CSV, and submit it.
- `POST /api/whatsapp/bulk-campaigns` creates a batch reference and validates rows against the shared provider schema.
- Each valid row creates one WhatsApp KYC case with status `consent_pending`, prefilled applicant details, and a secure session link.
- Cases are stored through the same `kyc_cases` path as single WhatsApp cases; applicant snapshots are persisted to `kyc_applicants` when Supabase is configured.
- Batch metadata and normalized rows are persisted to `kyc_bulk_batches` and `kyc_bulk_rows` for future scheduled provider intake.
- The UI exposes a provider-style CSV report for the same data that will later be dropped back to provider SFTP.

## Future SFTP Contract

- Provider-specific SFTP jobs fetch daily files into the same CSV schema.
- Each fetched file calls the same bulk ingestion service with `source = sftp` and the provider file name.
- Provider references, campaign IDs, and segments travel with the batch row for reconciliation.
- Final reports can be exported as CSV or JSON and pushed to the provider outbound SFTP folder.

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
