import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

export type VerificationReportCheck = {
  name: string;
  status: "DONE" | "PENDING" | "REVIEW";
  detail: string;
  score: number;
};

export function buildVerificationReport(kycCase: WhatsAppKycCase) {
  const identityDocumentType = kycCase.verification.identityDocument?.documentType ?? "Not captured";
  const identityOcrScore = Math.round((kycCase.verification.identityDocument?.ocrConfidence ?? 0) * 100);
  const proofDocument = kycCase.verification.proofOfAddressDocument;
  const proofDocumentType = proofDocument?.documentType ?? null;
  const addressOcrScore = Math.round((proofDocument?.simulatedOcrScore ?? 0) * 100);
  const gpsScore = kycCase.geoCapture ? Math.max(75, Math.min(100, 100 - Math.round((kycCase.geoCapture.accuracy ?? 25) / 2))) : 0;
  const deviceScore = kycCase.deviceIntelligence?.browserFingerprint && kycCase.deviceIntelligence.ipAddress ? 92 : kycCase.deviceIntelligence?.browserFingerprint ? 78 : 0;
  const checks: VerificationReportCheck[] = [
    {
      name: "Identity document OCR",
      status: kycCase.documentUrls.idDocument ? "DONE" : "PENDING",
      detail: kycCase.documentUrls.idDocument
        ? `${identityDocumentType} captured for ${kycCase.applicant.fullName ?? "applicant"} with simulated OCR confidence ${identityOcrScore}%.`
        : "Identity document is still required.",
      score: identityOcrScore,
    },
    {
      name: "Selfie liveness and face match",
      status: kycCase.verification.livenessScore && kycCase.verification.faceMatchScore ? "DONE" : "PENDING",
      detail:
        kycCase.verification.livenessScore && kycCase.verification.faceMatchScore
          ? `Liveness ${Math.round(kycCase.verification.livenessScore * 100)}%, face match ${Math.round(kycCase.verification.faceMatchScore * 100)}%.`
          : "Selfie capture or face match is still required.",
      score: Math.round((((kycCase.verification.livenessScore ?? 0) + (kycCase.verification.faceMatchScore ?? 0)) / 2) * 100),
    },
    {
      name: "Proof of address validation",
      status: kycCase.verification.proofOfAddressProvided || kycCase.verification.digitalAffidavitProvided ? "DONE" : "PENDING",
      detail: kycCase.verification.proofOfAddressProvided
        ? `${proofDocumentType ?? "Proof of address"} captured; accepted document ${proofDocument?.accepted ? "yes" : "needs review"}; simulated OCR score ${addressOcrScore}%.`
        : kycCase.verification.digitalAffidavitProvided
          ? "Digital affidavit fallback captured."
          : "Proof of address or affidavit is still required.",
      score: kycCase.verification.digitalAffidavitProvided ? 76 : addressOcrScore,
    },
    {
      name: "GPS, IP, and device location evidence",
      status: kycCase.geoCapture && kycCase.deviceIntelligence ? "DONE" : "PENDING",
      detail: kycCase.geoCapture
        ? `GPS ${kycCase.geoCapture.latitude}, ${kycCase.geoCapture.longitude} captured with ${kycCase.geoCapture.accuracy ?? "unknown"}m accuracy; IP ${kycCase.deviceIntelligence?.ipAddress ?? "not captured"}.`
        : "GPS location is still required.",
      score: Math.round((gpsScore + deviceScore) / 2),
    },
    {
      name: "DHA identity verification",
      status: kycCase.verification.idValidation?.isValid ? "DONE" : "REVIEW",
      detail: kycCase.verification.idValidation?.isValid
        ? "SA ID checksum and date structure passed; ready for DHA match."
        : "SA ID needs correction or external DHA review.",
      score: kycCase.verification.idValidation?.isValid ? 95 : 45,
    },
    {
      name: "TransUnion and Experian checks",
      status: kycCase.risk ? "DONE" : "PENDING",
      detail: kycCase.risk ? "Bureau risk inputs included in final decision model." : "Bureau checks run during final scoring.",
      score: kycCase.risk?.score ?? 0,
    },
    {
      name: "Risk decision",
      status: kycCase.risk ? "DONE" : "PENDING",
      detail: kycCase.risk ? `${kycCase.risk.decision} with score ${kycCase.risk.score}.` : "Final decision is not calculated yet.",
      score: kycCase.risk?.score ?? 0,
    },
  ];
  const simulationScore = Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);

  return {
    reference: kycCase.reference,
    tenant: kycCase.tenant,
    status: kycCase.status,
    applicant: {
      fullName: kycCase.applicant.fullName ?? "Pending",
      phoneNumber: kycCase.applicant.phoneNumber ?? "Pending",
      idNumber: kycCase.applicant.idNumber ?? "Pending",
    },
    evidence: {
      idDocumentCaptured: Boolean(kycCase.documentUrls.idDocument),
      selfieCaptured: Boolean(kycCase.documentUrls.selfie),
      proofOfAddressCaptured: Boolean(kycCase.documentUrls.proofOfAddress),
      proofOfAddressDocumentType: proofDocumentType,
      proofOfAddressAccepted: proofDocument?.accepted ?? null,
      proofOfAddressOcrScore: proofDocument ? addressOcrScore : null,
      affidavitCaptured: Boolean(kycCase.affidavit),
      locationCaptured: Boolean(kycCase.geoCapture),
      latitude: kycCase.geoCapture?.latitude ?? null,
      longitude: kycCase.geoCapture?.longitude ?? null,
      accuracy: kycCase.geoCapture?.accuracy ?? null,
      what3words: kycCase.geoCapture?.what3words ?? null,
      locationDescription: kycCase.geoCapture
        ? `${kycCase.geoCapture.latitude}, ${kycCase.geoCapture.longitude}${kycCase.geoCapture.what3words ? ` (${kycCase.geoCapture.what3words})` : ""}`
        : "Not captured",
      ipAddress: kycCase.deviceIntelligence?.ipAddress ?? null,
      deviceDescription: kycCase.deviceIntelligence
        ? `${kycCase.deviceIntelligence.browser || "Browser"} / ${kycCase.deviceIntelligence.screenSize || "screen unknown"} / ${kycCase.deviceIntelligence.timezone || "timezone unknown"}`
        : "Not captured",
    },
    checks,
    simulation: {
      score: simulationScore,
      band: simulationScore >= 85 ? "low risk" : simulationScore >= 70 ? "review" : "high risk",
    },
    decision: kycCase.risk?.decision ?? "PENDING",
    score: kycCase.risk?.score ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export function verificationReportToCsv(report: ReturnType<typeof buildVerificationReport>) {
  const header = "reference,tenant,applicant,status,check,checkStatus,checkScore,detail,gps,ipAddress,device,proofDocument,simulationScore,simulationBand,decision,riskScore,generatedAt";
  const rows = report.checks.map((check) =>
    [
      report.reference,
      report.tenant,
      report.applicant.fullName,
      report.status,
      check.name,
      check.status,
      check.score,
      check.detail,
      report.evidence.locationDescription,
      report.evidence.ipAddress ?? "",
      report.evidence.deviceDescription,
      report.evidence.proofOfAddressDocumentType ?? "",
      report.simulation.score,
      report.simulation.band,
      report.decision,
      report.score ?? "",
      report.generatedAt,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}
