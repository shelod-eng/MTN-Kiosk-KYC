# BullMQ Setup Guide for WhatsApp KYC-Now

## 1. Environment Setup

Install dependencies:

```bash
npm install bullmq ioredis
```

Run Redis locally:

```bash
npm run redis:local
```

Set environment variables:

```env
REDIS_URL=redis://localhost:6379
BULLMQ_QUEUE_PREFIX=kyc-now
BULLMQ_WORKER_CONCURRENCY=5
INTERNAL_API_BASE_URL=http://localhost:3000
```

Cloud options include Redis Cloud, AWS ElastiCache, Upstash Redis, or another managed Redis service. For Vercel production, use a managed Redis service rather than a local container.

## 2. Queue Definitions

The prototype defines three queues in `src/lib/kyc-queue.ts`:

- `otp_dispatch`: sends WhatsApp OTP through the existing OTP endpoint.
- `kyc_case`: tracks case-stage orchestration such as applicant details, ID OCR, biometrics, address, affidavit, and location.
- `verification_report`: runs final verification and report generation.

Queue API:

- `GET /api/whatsapp/queue`: returns queue health and job counts.
- `POST /api/whatsapp/queue`: enqueues jobs.

Example OTP job:

```json
{
  "queue": "otp_dispatch",
  "data": {
    "caseId": "WA-CASE-123",
    "msisdn": "+27821234567",
    "provider": "MTN",
    "source": "bulk",
    "batchReference": "BULK-MTN-001"
  }
}
```

## 3. Workers

Start Next.js:

```bash
npm run dev
```

Start workers in another terminal:

```bash
npm run worker
```

The worker script is `scripts/kyc-worker.mjs`. It consumes BullMQ jobs and calls the existing API endpoints, which keeps verification logic centralized.

Worker behavior:

- `otp_dispatch` calls `POST /api/whatsapp/otp/send`.
- `kyc_case` records orchestration stage metadata for future expansion.
- `verification_report` calls `POST /api/whatsapp/verification`.

## 4. Queue Orchestration

Single intake:

1. Create one KYC case.
2. Enqueue one `otp_dispatch` job.
3. Customer completes the same WhatsApp journey.
4. Enqueue `verification_report` after all evidence is captured.

Bulk intake:

1. Parse CSV/SFTP file.
2. Create one KYC case per valid MSISDN.
3. Enqueue one `otp_dispatch` job per case.
4. Process cases independently.
5. Export provider report when cases complete.

## 5. Concurrency and Retry

Default job settings:

- `attempts`: 3
- `backoff`: exponential, starting at 2 seconds
- completed job retention: 24 hours / 1,000 jobs
- failed job retention: 7 days / 1,000 jobs

Worker concurrency is configured with:

```env
BULLMQ_WORKER_CONCURRENCY=5
```

Scale worker processes horizontally for larger MNO batches.

## 6. Twilio Integration

Twilio WhatsApp API should be called in the `otp_dispatch` path once production credentials are configured.

Inbound Twilio messages should continue to hit:

```text
/api/whatsapp/webhook
```

The webhook advances each case through the same state machine and can enqueue the next background job where needed.

## 7. Production Notes

- Use managed Redis in production.
- Protect queue routes with service authentication before external exposure.
- Store job IDs and statuses in Supabase/Postgres if long-term audit reporting is required.
- Keep uploaded evidence in signed object storage rather than data URLs.
- Keep Twilio template approval and WhatsApp Business registration separate from queue setup.
