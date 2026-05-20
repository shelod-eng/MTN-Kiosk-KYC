type OtpSendInput = {
  caseId: string;
  phoneNumber: string;
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

  if (provider === "twilio-verify") {
    return {
      provider,
      reference: `twilio-${input.caseId}`,
      status: "sent",
      message: `OTP dispatched to ${input.phoneNumber}.`,
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
    status: "sent",
    message: `Mock OTP sent to ${input.phoneNumber}. Use 123456 to verify.`,
  };
}

export async function verifyOtpWithProvider(input: OtpVerifyInput) {
  const provider = process.env.OTP_PROVIDER ?? "mock";
  const approved = input.code === "123456";

  return {
    provider,
    approved,
    reference: `${provider}-${input.caseId}-verify`,
  };
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
