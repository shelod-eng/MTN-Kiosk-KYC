# KYC-Now Dashboard Enhancement Report

## Purpose

This report summarises the latest dashboard improvements for the KYC-Now prototype. The dashboard now supports clearer sponsor, MNO, and admin reporting around KYC/RICA compliance, affidavit fallback handling, queue visibility, evidence completeness, and audit readiness.

## Enhancements Covered

### Sponsor View

- Added a visual KYC/RICA decision workflow for proof-of-address handling.
- Shows the current selected case path:
  - valid proof of address under 3 months: proceed
  - expired proof over 3 months: affidavit fallback and manual review
  - missing proof: affidavit mandatory
- Added selected-case risk breakdown so sponsors can see why a case is approved, reviewed, or rejected.
- Added sponsor-facing RICA proof status in the selected case snapshot.

### MNO View

- Added provider conversion funnel showing movement through:
  - pending
  - review
  - approved
  - failed
- Improved queue health visibility for OTP, orchestration, and verification activity.
- Kept row-level MSISDN outcomes for bulk campaign tracking.
- Continued support for provider-specific reporting across MTN, Vodacom, and Cell C.

### Admin View

- Added audit trail timeline for key compliance events:
  - OTP sent
  - OTP verified
  - ID checksum passed
  - document uploaded
  - proof uploaded
  - proof expired
  - affidavit requested
  - affidavit uploaded
  - selfie verified
  - final verification complete
- Added Admin-only uploaded evidence gallery.
- Evidence gallery can display browser-uploaded image evidence from the case payload, including:
  - ID document image
  - selfie image
  - proof-of-address image
  - affidavit image
- PDF proof documents are shown as openable evidence links where the payload stores a PDF data URL.

## KYC/RICA Logic Highlight

The dashboard now reflects the RICA-first decision model:

- Valid proof of address: normal KYC/RICA scoring.
- Expired proof of address: affidavit fallback is requested and the case is routed to manual review.
- Missing proof and missing affidavit: high-risk reject.
- Affidavit with GPS or tower evidence: valid fallback path, but reviewed manually.
- FICA, credit bureau, affordability, and AML checks remain extension modules and are not treated as the baseline MNO RICA decision.

## Gap Closure

The dashboard improvements address the main gaps identified in the project review:

- Risk scores now have an explanatory breakdown.
- Affidavit fallback is visible in both case evidence and audit timeline views.
- Queue health is visible instead of hidden in backend orchestration.
- MNOs can see provider conversion performance.
- Sponsors can understand the proof-of-address decision tree without technical detail.
- Admin users can inspect uploaded evidence images and audit sequence in one place.

## Remaining Production Considerations

- Real OCR provider integration is still required for production-grade ID and proof-of-address extraction.
- Real liveness and selfie-to-ID face match provider integration is still required.
- IP address capture needs further investigation and hardening for Vercel/proxy headers.
- BullMQ/Redis queue health will become fully live once Redis is configured in the production environment.
- PDF export for sponsor snapshot can be added as a later enhancement.

## Presentation Narrative

KYC-Now now gives sponsors and MNOs a clearer operational view of the RICA compliance journey. The dashboard proves that the platform does not simply reject customers who lack recent utility bills. Instead, it enforces controlled affidavit fallback, captures evidence, logs audit events, and routes the case to manual review where required.

This supports a practical MNO onboarding model: baseline KYC/RICA first, then optional FICA and bureau intelligence as value-added modules.
