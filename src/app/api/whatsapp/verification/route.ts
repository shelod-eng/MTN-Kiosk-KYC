import { NextRequest, NextResponse } from "next/server";
import { buildVerificationReport, verificationReportToCsv } from "@/lib/kyc-report";
import { getCase, runRiskAssessment } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string };

  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const scoredCase = await runRiskAssessment(body.caseId);
  const kycCase = scoredCase ?? (await getCase(body.caseId));

  if (!kycCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const report = buildVerificationReport(kycCase);

  return NextResponse.json({
    case: kycCase,
    report,
    csv: verificationReportToCsv(report),
    whatsappSummary: [
      `KYC verification complete for ${report.applicant.fullName}.`,
      `Reference: ${report.reference}`,
      `Decision: ${report.decision}`,
      `Final score: ${report.score ?? report.simulation.score}`,
      `Status: ${report.status}`,
    ].join("\n"),
  });
}
