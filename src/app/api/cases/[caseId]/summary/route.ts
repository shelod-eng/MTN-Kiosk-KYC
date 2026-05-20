import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/staff-auth";
import { getCaseSummary } from "@/lib/whatsapp-store";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requirePermission(request, "case:view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { caseId } = await context.params;
  const summary = await getCaseSummary(caseId);
  if (!summary) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    summary,
    requestedBy: auth.context,
  });
}
