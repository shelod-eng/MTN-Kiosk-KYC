import { NextRequest, NextResponse } from "next/server";
import { getCase, updateCaseStatus } from "@/lib/whatsapp-store";
import { requirePermission } from "@/lib/staff-auth";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = requirePermission(request, "case:review");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { caseId } = await context.params;
  const current = await getCase(caseId);

  if (!current) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const body = (await request.json()) as { status?: string };
  if (!body.status) {
    return NextResponse.json({ error: "Missing status." }, { status: 400 });
  }

  try {
    const updatedCase = await updateCaseStatus(caseId, body.status as typeof current.status);
    return NextResponse.json({ case: updatedCase, updatedBy: auth.context });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Status update failed." },
      { status: 400 }
    );
  }
}
