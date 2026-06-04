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
- optional `providerReference`
- optional `towerId`
- optional `locationEvidence`

The ingestion route normalizes South African mobile numbers to E.164 (`+27...`) and rejects rows where `idNumber` is not 13 digits. Full checksum and demographic validation continues in the downstream KYC details and risk stages.

## Informal Settlement Residence Evidence

For customers who do not have a utility bill or formal proof of residence, the platform accepts a hybrid evidence path:

- Digital affidavit fallback: the customer answers structured residence questions and can attach a short video/selfie declaration.
- GPS capture: the customer shares live location, which is stored with raw coordinates, timestamp, and a What3Words identifier when configured.
- Tower-based approximation: providers can optionally enrich batch files with `towerId` and `locationEvidence` for a network-confirmed residence zone.
- Hybrid trust scoring: affidavit plus GPS can approve when the remaining trust checks pass; affidavit plus tower evidence is treated as provisional/review evidence; tower-only cases remain provisional until customer affidavit or GPS is captured.

Extended provider files should remain backward compatible. If `towerId` or `locationEvidence` is missing, ingestion still succeeds and the customer is prompted for affidavit/GPS during the secure session.

### Extended CSV Example

```csv
fullName,idNumber,phoneNumber,towerId,locationEvidence
Nomsa Dlamini,8801015800082,+27821234567,MTN_TWR_045,"GPS:-26.2041,28.0473"
Thabo Molefe,9002025800088,+27731234567,VOD_TWR_112,"Affidavit: Informal Settlement Zone 7"
Ayanda Khumalo,9503035800089,+27611234567,CELL_TWR_221,"GPS:-26.3456,28.1234"
```

Accepted aliases include `tower_id`, `cellTowerId`, `location_evidence`, and `residenceEvidence`.

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
- Optional residence evidence is copied into each case payload and persisted to `kyc_cases.gps_coordinates`, `kyc_cases.what3words_id`, `kyc_cases.tower_id`, `kyc_cases.location_evidence`, `kyc_cases.affidavit_video_url`, and `kyc_cases.residence_evidence_captured_at` when Supabase is configured.
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
- tower ID
- location evidence
- generated timestamp

## Production Notes

- Use SFTP with provider-specific folders and PGP-encrypted files.
- Store raw inbound files separately from normalized rows.
- Deduplicate by provider, MSISDN, and active campaign.
- Rate-limit WhatsApp sends per provider agreement.
- Return provider reports by SFTP drop-off and dashboard download.
