import { NextRequest, NextResponse } from "next/server";
import { captureDeviceIntelligence, getCaseBySessionToken } from "@/lib/whatsapp-store";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const kycCase = await getCaseBySessionToken(token);
  if (!kycCase) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const updatedCase = await captureDeviceIntelligence(kycCase.id, {
    browserFingerprint: String(body.browserFingerprint ?? ""),
    operatingSystem: String(body.operatingSystem ?? ""),
    browser: String(body.browser ?? ""),
    screenSize: String(body.screenSize ?? ""),
    timezone: String(body.timezone ?? ""),
    language: String(body.language ?? ""),
    touchCapable: Boolean(body.touchCapable),
    sessionContinuity: Boolean(body.sessionContinuity),
    cookiesEnabled: Boolean(body.cookiesEnabled),
  });

  return NextResponse.json({
    caseId: updatedCase?.id,
    deviceIntelligence: updatedCase?.deviceIntelligence,
  });
}
