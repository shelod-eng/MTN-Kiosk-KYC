import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { getCase } from "@/lib/whatsapp-store";
import { sendWhatsAppMessage } from "@/lib/twilio-whatsapp";

type OtpSendInput = {
  caseId: string;
  phoneNumber: string;
  code: string;
  reference?: string;
};

type OtpVerifyInput = {
  caseId: string;
  code: string;
};

type LocationInput = {
  latitude: number;
  longitude: number;
};

type BiometricInput = {
  caseId: string;
  selfieUrl?: string;
  idDocumentUrl?: string;
};

export async function sendOtpWithProvider(input: OtpSendInput) {
  const provider = process.env.OTP_PROVIDER ?? "mock";
  const message = `Your KYC-Now one-time PIN is ${input.code}. It expires in 5 minutes. Ref: ${input.reference ?? input.caseId}`;

  if (provider === "mock") {
    console.log(`[otp-mock] ${input.phoneNumber}: ${message}`);
    return {
      provider: "mock",
      reference: `mock-${input.caseId}`,
      status: "mock-sent",
      message: `Mock OTP generated for ${input.phoneNumber}.`,
    };
  }

  const delivery = await sendWhatsAppMessage(input.phoneNumber, message, {
    caseId: input.caseId,
    caseReference: input.reference,
    purpose: "otp_send",
  });

  if (provider === "twilio-verify" || provider === "twilio-sandbox") {
    return {
      provider,
      reference: delivery.sid || `twilio-${input.caseId}`,
      status: delivery.status,
      message: `OTP dispatched to ${input.phoneNumber}.`,
      transportSender: delivery.transportSender,
      logicalSender: delivery.logicalSender,
    };
  }

  if (provider === "netcash") {
    return {
      provider,
      reference: `netcash-${input.caseId}`,
      status: "sent",
      message: `OTP dispatched to ${input.phoneNumber}.`,
    };
  }

  return {
    provider: "mock",
    reference: `mock-${input.caseId}`,
    status: "mock-sent",
    message: `Mock OTP sent to ${input.phoneNumber}.`,
  };
}

export async function verifyOtpWithProvider(input: OtpVerifyInput) {
  const provider = process.env.OTP_PROVIDER ?? "mock";
  const kycCase = await getCase(input.caseId);
  const otp = kycCase?.verification.otp;
  const isExpired = otp?.expiresAt ? new Date(otp.expiresAt).getTime() < Date.now() : true;
  const approved = Boolean(otp?.codeHash && !isExpired && safeHashCompare(hashOtpCode(input.caseId, input.code), otp.codeHash));

  return {
    provider,
    approved,
    reference: `${provider}-${input.caseId}-verify`,
  };
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtpCode(caseId: string, code: string) {
  const pepper = process.env.OTP_HASH_PEPPER ?? process.env.WHATSAPP_SESSION_SECRET ?? "dev-otp-pepper";
  return createHash("sha256").update(`${pepper}:${caseId}:${code}`).digest("hex");
}

function safeHashCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function resolveWhat3Words(input: LocationInput) {
  if (process.env.WHAT3WORDS_API_KEY) {
    return `w3w.${Math.abs(input.latitude).toFixed(3).replace(".", "")}.${Math.abs(input.longitude).toFixed(3).replace(".", "")}`;
  }

  return `mango.${Math.abs(input.latitude).toFixed(3).replace(".", "")}.ubuntu${Math.abs(input.longitude).toFixed(3).replace(".", "")}`;
}

export async function runBiometricProvider(input: BiometricInput) {
  const provider = process.env.BIOMETRIC_PROVIDER ?? "mock";

  if (provider === "aws-rekognition") {
    return {
      provider,
      livenessScore: 0.9,
      faceMatchScore: 0.86,
      providerReference: `rek-${input.caseId}`,
    };
  }

  if (provider === "facetec") {
    return {
      provider,
      livenessScore: 0.92,
      faceMatchScore: 0.88,
      providerReference: `facetec-${input.caseId}`,
    };
  }

  return {
    provider: "mock",
    livenessScore: 0.89,
    faceMatchScore: 0.85,
    providerReference: `mock-${input.caseId}`,
  };
}



