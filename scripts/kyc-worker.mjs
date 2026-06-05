import { Worker } from "bullmq";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error("REDIS_URL is required to run the KYC worker.");
  process.exit(1);
}

const connection = parseRedisUrl(redisUrl);

const prefix = process.env.BULLMQ_QUEUE_PREFIX ?? "kyc-now";
const concurrency = Number(process.env.BULLMQ_WORKER_CONCURRENCY ?? 5);
const apiBaseUrl = (process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function staffHeaders() {
  return {
    "Content-Type": "application/json",
    "x-staff-id": "bullmq-worker",
    "x-staff-name": "BullMQ Worker",
    "x-staff-role": "system",
  };
}

async function postJson(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: staffHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${path} (${response.status})`);
  }
  return payload;
}

const workers = [
  new Worker(
    "otp_dispatch",
    async (job) => {
      return postJson("/api/whatsapp/otp/send", {
        caseId: job.data.caseId,
      });
    },
    { connection, prefix, concurrency }
  ),
  new Worker(
    "kyc_case",
    async (job) => {
      return {
        status: "recorded",
        caseId: job.data.caseId,
        stage: job.data.stage,
        note: "KYC case-stage jobs are tracked for orchestration; customer actions still complete through the WhatsApp webhook/session APIs.",
      };
    },
    { connection, prefix, concurrency }
  ),
  new Worker(
    "verification_report",
    async (job) => {
      return postJson("/api/whatsapp/verification", {
        caseId: job.data.caseId,
      });
    },
    { connection, prefix, concurrency }
  ),
];

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] completed ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[${worker.name}] failed ${job?.id}: ${error.message}`);
  });
}

console.log(`KYC BullMQ workers started against ${apiBaseUrl} with concurrency ${concurrency}.`);

async function shutdown() {
  console.log("Stopping KYC BullMQ workers...");
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function parseRedisUrl(value) {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
