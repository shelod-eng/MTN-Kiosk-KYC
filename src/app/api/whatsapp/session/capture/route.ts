import { NextRequest, NextResponse } from "next/server";
import { captureDeviceIntelligence } from "@/lib/whatsapp-store";
import type { DeviceIntelligence } from "@/lib/whatsapp-kyc";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as DeviceIntelligence & { caseId?: string };

  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const updatedCase = await captureDeviceIntelligence(body.caseId, {
    browserFingerprint: body.browserFingerprint,
    operatingSystem: body.operatingSystem,
    browser: body.browser,
    screenSize: body.screenSize,
    timezone: body.timezone,
    language: body.language,
    touchCapable: body.touchCapable,
    sessionContinuity: body.sessionContinuity,
    cookiesEnabled: body.cookiesEnabled,
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    deviceIntelligence: updatedCase.deviceIntelligence,
    status: updatedCase.status,
  });
}
