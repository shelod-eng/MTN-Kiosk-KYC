import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/staff-auth";
import { getCaseAuditExport } from "@/lib/whatsapp-store";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:export");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const caseId = request.nextUrl.searchParams.get("caseId");
  const format = (request.nextUrl.searchParams.get("format") ?? "json") as "json" | "csv";
  if (!caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const exported = await getCaseAuditExport(caseId, format);
  if (!exported) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  if (format === "csv") {
    return new NextResponse(String(exported), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${caseId}-audit.csv\"`,
      },
    });
  }

  return NextResponse.json({
    caseId,
    entries: exported,
    requestedBy: auth.context,
  });
}
