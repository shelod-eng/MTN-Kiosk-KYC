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
  const proofReviewReason = proofDocument?.reviewReason ?? null;
  const affidavitExtractedIdNumber = kycCase.affidavit?.extractedIdNumber ?? null;
  const affidavitIdMatch = kycCase.affidavit?.matchedIdNumber ?? null;
  const affidavitAddress = kycCase.affidavit?.aiExtractedAddress ?? kycCase.affidavit?.address ?? null;
  const identityExtractedIdNumber = kycCase.verification.identityDocument?.extractedIdNumber ?? null;
  const identityMatchedEnteredId = kycCase.verification.identityDocument?.matchedEnteredId ?? null;
  const addressOcrScore = Math.round((proofDocument?.simulatedOcrScore ?? 0) * 100);
  const gpsScore = kycCase.geoCapture ? Math.max(75, Math.min(100, 100 - Math.round((kycCase.geoCapture.accuracy ?? 25) / 2))) : 0;
  const deviceScore = kycCase.deviceIntelligence?.browserFingerprint && kycCase.deviceIntelligence.ipAddress ? 92 : kycCase.deviceIntelligence?.browserFingerprint ? 78 : 0;
  const hasIpAddress = Boolean(kycCase.deviceIntelligence?.ipAddress?.trim());
  const riskBand = kycCase.risk?.band ? `${kycCase.risk.band} risk` : null;
  const checks: VerificationReportCheck[] = [
    {
      name: "Identity document OCR",
      status: kycCase.documentUrls.idDocument ? (identityMatchedEnteredId === false ? "REVIEW" : "DONE") : "PENDING",
      detail: kycCase.documentUrls.idDocument
        ? identityMatchedEnteredId === false
          ? `${identityDocumentType} captured, but extracted ID ${identityExtractedIdNumber ?? "unknown"} does not match entered applicant ID ${kycCase.applicant.idNumber ?? "unknown"}.`
          : `${identityDocumentType} captured for ${kycCase.applicant.fullName ?? "applicant"} with simulated OCR confidence ${identityOcrScore}%.`
        : "Identity document is still required.",
      score: identityMatchedEnteredId === false ? 45 : identityOcrScore,
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
        ? `${proofDocumentType ?? "Proof of address"} captured; accepted document ${proofDocument?.accepted ? "yes" : "needs RICA review"}; simulated OCR score ${addressOcrScore}%${proofReviewReason ? `; ${proofReviewReason}` : ""}.`
        : kycCase.verification.digitalAffidavitProvided
          ? `Digital affidavit fallback captured${kycCase.affidavit?.aiValidationScore ? ` with AI validation ${Math.round(kycCase.affidavit.aiValidationScore * 100)}%` : ""}.`
          : "Proof of address or affidavit is still required.",
      score: kycCase.verification.digitalAffidavitProvided ? Math.round((kycCase.affidavit?.aiValidationScore ?? 0.76) * 100) : addressOcrScore,
    },
    {
      name: "Affidavit ID/address extraction",
      status: kycCase.verification.digitalAffidavitProvided ? "DONE" : "PENDING",
      detail: kycCase.verification.digitalAffidavitProvided
        ? `Affidavit read${affidavitIdMatch === true ? ": ID matches entered value" : affidavitIdMatch === false ? ": ID mismatch" : ""}${affidavitAddress ? `; extracted address "${affidavitAddress}"` : ""}.`
        : "Affidavit fallback has not been completed.",
      score: kycCase.verification.digitalAffidavitProvided ? (affidavitIdMatch === false ? 55 : 90) : 0,
    },
    {
      name: "ID OCR number match",
      status: kycCase.documentUrls.idDocument ? "DONE" : "PENDING",
      detail: kycCase.documentUrls.idDocument
        ? identityExtractedIdNumber
          ? identityMatchedEnteredId === true
            ? `Extracted ID ${identityExtractedIdNumber} matches entered applicant ID.`
            : identityMatchedEnteredId === false
              ? `Extracted ID ${identityExtractedIdNumber} does not match entered applicant ID.`
              : `Extracted ID ${identityExtractedIdNumber} could not be compared to entered ID.`
          : "OCR extracted no ID number from the document."
        : "Identity document upload has not completed.",
      score: kycCase.documentUrls.idDocument ? (identityMatchedEnteredId === false ? 55 : identityExtractedIdNumber ? 95 : 70) : 0,
    },
    {
      name: "GPS, IP, and device location evidence",
      status: kycCase.geoCapture && hasIpAddress ? "DONE" : kycCase.geoCapture || kycCase.deviceIntelligence ? "REVIEW" : "PENDING",
      detail:
        kycCase.geoCapture && hasIpAddress
          ? `GPS ${kycCase.geoCapture.latitude}, ${kycCase.geoCapture.longitude} captured with ${kycCase.geoCapture.accuracy ?? "unknown"}m accuracy; IP ${kycCase.deviceIntelligence?.ipAddress}.`
          : kycCase.geoCapture
            ? `GPS ${kycCase.geoCapture.latitude}, ${kycCase.geoCapture.longitude} captured, but IP address is missing evidence - flag for manual review.`
            : hasIpAddress
              ? `IP ${kycCase.deviceIntelligence?.ipAddress} captured, but GPS location is missing evidence - flag for manual review.`
              : "GPS and IP evidence are missing - flag for manual review.",
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
      name: "FICA extension checks",
      status: kycCase.risk ? "DONE" : "PENDING",
      detail: "Not used for the MNO KYC/RICA baseline decision in this prototype; TransUnion, Experian, affordability, and AML can be enabled as production value-add modules.",
      score: 100,
    },
    {
      name: "KYC/RICA baseline decision",
      status: kycCase.risk ? "DONE" : "PENDING",
      detail: kycCase.risk
        ? `${kycCase.risk.decision} with score ${kycCase.risk.score}. Decision is based on ID, proof/affidavit, selfie/liveness, GPS/tower/IP, device evidence, and audit completeness.`
        : "Final KYC/RICA decision is not calculated yet.",
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
      proofOfAddressReviewReason: proofReviewReason,
      affidavitCaptured: Boolean(kycCase.affidavit),
      affidavitExtractedIdNumber: affidavitExtractedIdNumber,
      affidavitIdMatch: affidavitIdMatch,
      affidavitText: kycCase.affidavit?.affidavitText ?? null,
      affidavitImageUrl: kycCase.documentUrls.affidavitImage ?? null,
      identityExtractedIdNumber: identityExtractedIdNumber,
      identityMatchedEnteredId: identityMatchedEnteredId,
      affidavitAddress: affidavitAddress,
      locationCaptured: Boolean(kycCase.geoCapture),
      latitude: kycCase.geoCapture?.latitude ?? null,
      longitude: kycCase.geoCapture?.longitude ?? null,
      accuracy: kycCase.geoCapture?.accuracy ?? null,
      what3words: kycCase.geoCapture?.what3words ?? null,
      locationDescription: kycCase.geoCapture
        ? `${kycCase.geoCapture.latitude}, ${kycCase.geoCapture.longitude}${kycCase.geoCapture.what3words ? ` (${kycCase.geoCapture.what3words})` : ""}`
        : "Not captured",
      towerId: kycCase.residenceEvidence?.towerId ?? kycCase.geoCapture?.towerId ?? null,
      ipAddress: kycCase.deviceIntelligence?.ipAddress ?? null,
      deviceDescription: kycCase.deviceIntelligence
        ? `${kycCase.deviceIntelligence.browser || "Browser"} / ${kycCase.deviceIntelligence.screenSize || "screen unknown"} / ${kycCase.deviceIntelligence.timezone || "timezone unknown"}`
        : "Not captured",
    },
    checks,
    simulation: {
      score: simulationScore,
      band: riskBand ?? (simulationScore >= 85 ? "low risk" : simulationScore >= 70 ? "review" : "high risk"),
    },
    decision: kycCase.risk?.decision ?? "PENDING",
    score: kycCase.risk?.score ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export function verificationReportToCsv(report: ReturnType<typeof buildVerificationReport>) {
  const header = "reference,tenant,applicant,status,check,checkStatus,checkScore,detail,idDocumentIdExtracted,idDocumentMatch,affidavitExtractedId,affidavitMatch,affidavitText,affidavitImageUrl,gps,towerId,ipAddress,device,proofDocument,simulationScore,simulationBand,decision,riskScore,generatedAt";
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
      report.evidence.identityExtractedIdNumber ?? "",
      report.evidence.identityMatchedEnteredId !== null ? String(report.evidence.identityMatchedEnteredId) : "",
      report.evidence.affidavitExtractedIdNumber ?? "",
      report.evidence.affidavitIdMatch !== null ? String(report.evidence.affidavitIdMatch) : "",
      report.evidence.affidavitText ?? "",
      report.evidence.affidavitImageUrl ?? "",
      report.evidence.locationDescription,
      report.evidence.towerId ?? "",
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
