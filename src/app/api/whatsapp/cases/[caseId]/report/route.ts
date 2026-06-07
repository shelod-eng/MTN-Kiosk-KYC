import { NextRequest, NextResponse } from "next/server";
import { buildVerificationReport, verificationReportToCsv } from "@/lib/kyc-report";
import { getCase } from "@/lib/whatsapp-store";

type LocalRouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: NextRequest, context: LocalRouteContext) {
  const { caseId } = await context.params;
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const kycCase = await getCase(caseId);

  if (!kycCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const report = buildVerificationReport(kycCase);

  if (format === "csv") {
    return new NextResponse(verificationReportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kycCase.reference}-verification-report.csv"`,
      },
    });
  }

  return NextResponse.json({ report });
}
