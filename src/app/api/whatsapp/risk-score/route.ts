import { NextRequest, NextResponse } from "next/server";
import { runRiskAssessment } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string };
  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const updatedCase = await runRiskAssessment(body.caseId);
  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    caseId: updatedCase.id,
    risk: updatedCase.risk,
    status: updatedCase.status,
  });
}
