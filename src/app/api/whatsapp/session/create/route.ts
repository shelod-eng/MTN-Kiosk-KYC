import { NextRequest, NextResponse } from "next/server";
import { createCaseSession, captureDeviceIntelligence } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string };

  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const session = await createCaseSession(body.caseId);
  if (!session) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  // capture client IP if available from headers (x-forwarded-for or x-real-ip)
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
    if (ip) {
      await captureDeviceIntelligence(body.caseId, { ipAddress: ip });
    }
  } catch (e) {
    // non-fatal
  }

  return NextResponse.json({ session });
}
