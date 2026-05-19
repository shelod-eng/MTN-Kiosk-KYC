export type Decision = "APPROVE" | "REVIEW" | "REJECT";

export type StageStatus = "done" | "active" | "pending";

export type RiskBand = "low" | "medium" | "high";

export type Channel = "WhatsApp" | "Kiosk";

export type KycCase = {
  id: string;
  tenant: string;
  applicant: string;
  channel: Channel;
  stage: string;
  dhaVerified: boolean;
  ocrConfidence: number;
  liveness: number;
  transunionScore: number;
  experianBand: RiskBand;
  decision: Decision;
  reference: string;
  updatedAt: string;
};

export type Stage = {
  key: string;
  label: string;
  description: string;
  owner: string;
  status: StageStatus;
};

export type VerificationSignalSet = {
  ocrConfidence: number;
  liveness: number;
  dhaVerified: boolean;
  transunionScore: number;
  experianBand: RiskBand;
};

export const kioskJourneySteps = [
  "Personal Details",
  "Upload ID",
  "Selfie",
  "Proof of Address",
  "Verification",
] as const;

export const queueMetrics = [
  { label: "Active tenants", value: "12", note: "MTN, lenders, pharmacies, MNO pilots" },
  { label: "Cases in flight", value: "184", note: "Across kiosk and WhatsApp channels" },
  { label: "Average decision SLA", value: "01:42", note: "Target under 2 minutes from submission" },
  { label: "Manual review rate", value: "14%", note: "Mostly OCR and bureau soft-fail exceptions" },
];

export const orchestrationStages: Stage[] = [
  {
    key: "capture",
    label: "01 Personal details",
    description: "Name, SA ID, date of birth, channel consent, and tenant binding.",
    owner: "Frontend session",
    status: "done",
  },
  {
    key: "ocr",
    label: "02 ID upload + OCR",
    description: "ID image storage, OCR extraction, confidence thresholding, and review fallback.",
    owner: "OCR service",
    status: "done",
  },
  {
    key: "liveness",
    label: "03 Selfie + liveness",
    description: "Face match, spoof detection, and selfie-to-ID score comparison.",
    owner: "Biometric service",
    status: "active",
  },
  {
    key: "poa",
    label: "04 Proof of address",
    description: "Recency validation and address normalization before bureau calls.",
    owner: "Document validation",
    status: "pending",
  },
  {
    key: "dha",
    label: "05 DHA verification",
    description: "Citizenship and deceased-flag verification through an intermediary endpoint.",
    owner: "DHA connector",
    status: "pending",
  },
  {
    key: "bureau",
    label: "06 Bureau checks",
    description: "TransUnion fraud indicators and Experian risk score orchestration.",
    owner: "Risk connectors",
    status: "pending",
  },
  {
    key: "decision",
    label: "07 DMN decision",
    description: "Approve, review, or reject based on policy thresholds and audit logging.",
    owner: "Rules engine",
    status: "pending",
  },
];

export const sampleCases: KycCase[] = [
  {
    id: "CASE-2026-001",
    tenant: "MTN Kiosk",
    applicant: "Noluthando Mthembu",
    channel: "Kiosk",
    stage: "Risk decision",
    dhaVerified: true,
    ocrConfidence: 96,
    liveness: 0.91,
    transunionScore: 412,
    experianBand: "low",
    decision: "APPROVE",
    reference: "PMN-742191",
    updatedAt: "2 min ago",
  },
  {
    id: "CASE-2026-002",
    tenant: "WhatsApp Channel",
    applicant: "Siyabonga Khumalo",
    channel: "WhatsApp",
    stage: "Manual review",
    dhaVerified: true,
    ocrConfidence: 78,
    liveness: 0.82,
    transunionScore: 568,
    experianBand: "medium",
    decision: "REVIEW",
    reference: "PMN-742205",
    updatedAt: "6 min ago",
  },
  {
    id: "CASE-2026-003",
    tenant: "Fintech Partner",
    applicant: "Karabo Ndlovu",
    channel: "WhatsApp",
    stage: "Rejected",
    dhaVerified: false,
    ocrConfidence: 89,
    liveness: 0.88,
    transunionScore: 801,
    experianBand: "high",
    decision: "REJECT",
    reference: "PMN-742219",
    updatedAt: "9 min ago",
  },
];

export const channels = [
  {
    name: "WhatsApp intake",
    summary: "Zero-install onboarding with consent capture, uploads, and status notifications.",
    details: "Webhook session creation, media ingest, and step advancement mimic the Twilio or Meta Cloud API flow in the spec.",
  },
  {
    name: "MTN kiosk",
    summary: "Tablet-driven assisted capture with LTE or Wi-Fi sync resilience.",
    details: "Agent-led capture mirrors the physical retail use case and keeps raw bureau details hidden from kiosk operators.",
  },
];

export const apiSurface = [
  {
    label: "DHA verification",
    endpoint: "POST /api/mock/dha",
    note: "Returns citizen and deceased-flag verification with a mock SLA state.",
  },
  {
    label: "TransUnion fraud indicators",
    endpoint: "POST /api/mock/transunion",
    note: "Applies the 500 to 750 review band and 750-plus reject threshold from the spec.",
  },
  {
    label: "Experian risk scoring",
    endpoint: "POST /api/mock/experian",
    note: "Maps risk bands to DMN-ready output for approval, review, or rejection.",
  },
];

export const dmnRules = [
  "Approve when DHA is verified, OCR confidence is at least 85, TransUnion is below 500, Experian is low, and liveness is at least 0.75.",
  "Review when OCR confidence lands between 70 and 84, or when TransUnion is between 500 and 750, or when Experian is medium.",
  "Reject when DHA fails, TransUnion exceeds 750, Experian is high, or liveness drops below 0.75.",
];

export function computeDecision(input: {
  dhaVerified: boolean;
  ocrConfidence: number;
  transunionScore: number;
  experianBand: RiskBand;
  liveness: number;
}): Decision {
  if (!input.dhaVerified) return "REJECT";
  if (input.liveness < 0.75) return "REJECT";
  if (input.transunionScore > 750) return "REJECT";
  if (input.experianBand === "high") return "REJECT";
  if (input.ocrConfidence < 70) return "REVIEW";
  if (input.ocrConfidence < 85) return "REVIEW";
  if (input.transunionScore >= 500) return "REVIEW";
  if (input.experianBand === "medium") return "REVIEW";
  return "APPROVE";
}

export function deriveSignalsFromId(idNumber: string): VerificationSignalSet {
  const digits = idNumber.replace(/\D/g, "");
  const sum = digits.split("").reduce((total, digit) => total + Number(digit), 0);
  const lastDigit = Number(digits.at(-1) ?? 0);
  const ocrConfidence = 76 + (sum % 23);
  const liveness = Number((0.68 + (lastDigit % 25) / 100).toFixed(2));
  const transunionScore = 340 + (sum % 520);
  const dhaVerified = lastDigit % 5 !== 0;

  let experianBand: RiskBand = "low";
  if (transunionScore >= 500) experianBand = "medium";
  if (transunionScore > 730 || !dhaVerified) experianBand = "high";

  return {
    ocrConfidence: Math.min(98, ocrConfidence),
    liveness: Math.min(0.96, liveness),
    dhaVerified,
    transunionScore,
    experianBand,
  };
}

export function createReference(prefix = "PMN") {
  const token = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${token}`;
}
