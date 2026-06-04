import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

export type VerificationReportCheck = {
  name: string;
  status: "DONE" | "PENDING" | "REVIEW";
  detail: string;
};

export function buildVerificationReport(kycCase: WhatsAppKycCase) {
  const checks: VerificationReportCheck[] = [
    {
      name: "ID OCR extraction",
      status: kycCase.documentUrls.idDocument ? "DONE" : "PENDING",
      detail: kycCase.documentUrls.idDocument
        ? `Identity document captured for ${kycCase.applicant.fullName ?? "applicant"}.`
        : "Identity document is still required.",
    },
    {
      name: "Selfie liveness and face match",
      status: kycCase.verification.livenessScore && kycCase.verification.faceMatchScore ? "DONE" : "PENDING",
      detail:
        kycCase.verification.livenessScore && kycCase.verification.faceMatchScore
          ? `Liveness ${Math.round(kycCase.verification.livenessScore * 100)}%, face match ${Math.round(kycCase.verification.faceMatchScore * 100)}%.`
          : "Selfie capture or face match is still required.",
    },
    {
      name: "Proof of address validation",
      status: kycCase.verification.proofOfAddressProvided || kycCase.verification.digitalAffidavitProvided ? "DONE" : "PENDING",
      detail: kycCase.verification.proofOfAddressProvided
        ? "Proof of address document captured."
        : kycCase.verification.digitalAffidavitProvided
          ? "Digital affidavit fallback captured."
          : "Proof of address or affidavit is still required.",
    },
    {
      name: "DHA identity verification",
      status: kycCase.verification.idValidation?.isValid ? "DONE" : "REVIEW",
      detail: kycCase.verification.idValidation?.isValid
        ? "SA ID checksum and date structure passed; ready for DHA match."
        : "SA ID needs correction or external DHA review.",
    },
    {
      name: "TransUnion and Experian checks",
      status: kycCase.risk ? "DONE" : "PENDING",
      detail: kycCase.risk ? "Bureau risk inputs included in final decision model." : "Bureau checks run during final scoring.",
    },
    {
      name: "Risk decision",
      status: kycCase.risk ? "DONE" : "PENDING",
      detail: kycCase.risk ? `${kycCase.risk.decision} with score ${kycCase.risk.score}.` : "Final decision is not calculated yet.",
    },
  ];

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
      affidavitCaptured: Boolean(kycCase.affidavit),
      locationCaptured: Boolean(kycCase.geoCapture),
      what3words: kycCase.geoCapture?.what3words ?? null,
    },
    checks,
    decision: kycCase.risk?.decision ?? "PENDING",
    score: kycCase.risk?.score ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export function verificationReportToCsv(report: ReturnType<typeof buildVerificationReport>) {
  const header = "reference,tenant,applicant,status,check,checkStatus,detail,decision,score,generatedAt";
  const rows = report.checks.map((check) =>
    [
      report.reference,
      report.tenant,
      report.applicant.fullName,
      report.status,
      check.name,
      check.status,
      check.detail,
      report.decision,
      report.score ?? "",
      report.generatedAt,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}
