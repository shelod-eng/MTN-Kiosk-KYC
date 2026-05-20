import { NextRequest, NextResponse } from "next/server";
import { getCase } from "@/lib/whatsapp-store";
import { requirePermission } from "@/lib/staff-auth";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const request = _request;
  const auth = requirePermission(request, "case:view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { caseId } = await context.params;
  const kycCase = await getCase(caseId);

  if (!kycCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({ case: kycCase, requestedBy: auth.context });
}
