import { NextRequest, NextResponse } from "next/server";
import { listCases } from "@/lib/whatsapp-store";
import { requirePermission } from "@/lib/staff-auth";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  return NextResponse.json({
    cases: await listCases(),
    requestedBy: auth.context,
  });
}
