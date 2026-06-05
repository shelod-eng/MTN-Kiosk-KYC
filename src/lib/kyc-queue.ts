import { Queue, type JobsOptions } from "bullmq";

export const kycQueueNames = {
  otpDispatch: "otp_dispatch",
  kycCase: "kyc_case",
  verificationReport: "verification_report",
} as const;

export type KycQueueName = (typeof kycQueueNames)[keyof typeof kycQueueNames];

export type OtpDispatchJob = {
  caseId: string;
  msisdn: string;
  provider: "MTN" | "Vodacom" | "Cell C";
  source: "single" | "bulk";
  batchReference?: string;
};

export type KycCaseJob = {
  caseId: string;
  stage: "applicant_details" | "id_ocr" | "biometrics" | "address" | "affidavit" | "location";
  source: "single" | "bulk";
  batchReference?: string;
};

export type VerificationReportJob = {
  caseId: string;
  provider: "MTN" | "Vodacom" | "Cell C";
  source: "single" | "bulk";
  batchReference?: string;
};

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2_000,
  },
  removeOnComplete: {
    age: 60 * 60 * 24,
    count: 1_000,
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 7,
    count: 1_000,
  },
};

type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
};

let redisConnection: RedisConnectionOptions | null = null;
let queues: {
  otpDispatch: Queue;
  kycCase: Queue;
  verificationReport: Queue;
} | null = null;

export function isQueueConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function getQueueConnection() {
  if (!isQueueConfigured()) return null;
  if (!redisConnection) {
    redisConnection = parseRedisUrl(process.env.REDIS_URL!);
  }
  return redisConnection;
}

function parseRedisUrl(value: string): RedisConnectionOptions {
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

export function getKycQueues() {
  const connection = getQueueConnection();
  if (!connection) return null;

  if (!queues) {
    const prefix = process.env.BULLMQ_QUEUE_PREFIX ?? "kyc-now";
    queues = {
      otpDispatch: new Queue<OtpDispatchJob>(kycQueueNames.otpDispatch, {
        connection,
        prefix,
        defaultJobOptions,
      }),
      kycCase: new Queue<KycCaseJob>(kycQueueNames.kycCase, {
        connection,
        prefix,
        defaultJobOptions,
      }),
      verificationReport: new Queue<VerificationReportJob>(kycQueueNames.verificationReport, {
        connection,
        prefix,
        defaultJobOptions,
      }),
    };
  }

  return queues;
}

export async function enqueueOtpDispatch(data: OtpDispatchJob) {
  const queueMap = getKycQueues();
  if (!queueMap) return { queued: false as const, reason: "REDIS_URL is not configured." };
  const job = await queueMap.otpDispatch.add(`otp:${data.caseId}`, data, {
    jobId: `otp:${data.caseId}`,
  });
  return { queued: true as const, queue: kycQueueNames.otpDispatch, jobId: job.id };
}

export async function enqueueKycCase(data: KycCaseJob) {
  const queueMap = getKycQueues();
  if (!queueMap) return { queued: false as const, reason: "REDIS_URL is not configured." };
  const job = await queueMap.kycCase.add(`${data.stage}:${data.caseId}`, data);
  return { queued: true as const, queue: kycQueueNames.kycCase, jobId: job.id };
}

export async function enqueueVerificationReport(data: VerificationReportJob) {
  const queueMap = getKycQueues();
  if (!queueMap) return { queued: false as const, reason: "REDIS_URL is not configured." };
  const job = await queueMap.verificationReport.add(`report:${data.caseId}`, data, {
    jobId: `report:${data.caseId}`,
  });
  return { queued: true as const, queue: kycQueueNames.verificationReport, jobId: job.id };
}

export async function getQueueSnapshot() {
  const queueMap = getKycQueues();
  if (!queueMap) {
    return {
      configured: false,
      queues: [],
    };
  }

  const entries = await Promise.all(
    Object.entries(queueMap).map(async ([key, queue]) => ({
      key,
      name: queue.name,
      counts: await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    }))
  );

  return {
    configured: true,
    queues: entries,
  };
}
