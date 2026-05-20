import { NextRequest, NextResponse } from "next/server";
import { createCaseSession } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string };

  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const session = await createCaseSession(body.caseId);
  if (!session) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({ session });
}
