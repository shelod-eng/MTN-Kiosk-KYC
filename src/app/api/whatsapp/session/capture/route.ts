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
    ipAddress: body.ipAddress ?? getRequestIp(request),
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

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  const clientIp = request.headers.get("x-client-ip")?.trim();
  const requestIp = typeof (request as unknown as { ip?: string }).ip === "string" ? (request as unknown as { ip: string }).ip : undefined;

  return forwardedFor || realIp || cloudflareIp || clientIp || requestIp || "local-dev";
}
