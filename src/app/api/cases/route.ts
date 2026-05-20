import { NextResponse } from "next/server";
import { sampleCases } from "@/lib/mock-data";
import { listCases } from "@/lib/whatsapp-store";

export async function GET() {
  const storedCases = await listCases();
  const whatsappCases = storedCases.map((kycCase) => ({
    id: kycCase.id,
    tenant: `${kycCase.tenant} WhatsApp`,
    applicant: kycCase.applicant.fullName ?? "Pending applicant details",
    channel: "WhatsApp" as const,
    stage: kycCase.status,
    dhaVerified: Boolean(kycCase.verification.idValidation?.isValid),
    ocrConfidence: 0,
    liveness: Number(kycCase.verification.livenessScore ?? 0),
    transunionScore: kycCase.risk?.score ?? 0,
    experianBand: kycCase.risk?.band ?? "medium",
    decision: kycCase.risk?.decision ?? "REVIEW",
    reference: kycCase.reference,
    updatedAt: kycCase.updatedAt,
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    cases: [...whatsappCases, ...sampleCases],
  });
}
