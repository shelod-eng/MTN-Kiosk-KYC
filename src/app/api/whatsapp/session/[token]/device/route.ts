import { NextRequest, NextResponse } from "next/server";
import { captureDeviceIntelligence, getCaseBySessionToken } from "@/lib/whatsapp-store";

type LocalRouteContext = {
  params: Promise<{ token: string }>;
};

function isValidPublicIp(ip: string | null | undefined): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  // Reject localhost, IPv6 loopback, private ranges, and malformed
  if (/^(127|::1|0\.0\.0\.0|localhost|unknown|,|:|^\s*$)/.test(trimmed)) return false;
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(trimmed)) return false;
  // Valid IPv4: 4 octets separated by dots
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return true;
  // Valid IPv6: contains at least 2 colons and is not loopback
  if (trimmed.includes(":") && !trimmed.startsWith("::")) return true;
  return false;
}

export async function POST(request: NextRequest, context: LocalRouteContext) {
  const { token } = await context.params;
  const kycCase = await getCaseBySessionToken(token);
  if (!kycCase) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip");
  const remoteAddr = typeof (request as unknown as { ip?: string }).ip === "string" ? (request as unknown as { ip: string }).ip : undefined;
  
  // Validate and select the best available IP, filtering out localhost and invalid formats
  const candidateIps = [forwardedFor, realIp, remoteAddr].filter(Boolean);
  const validIp = candidateIps.find((ip) => ip && isValidPublicIp(ip));
  const ipAddress = validIp || (forwardedFor || realIp || remoteAddr || "demo-local-ip");
  const updatedCase = await captureDeviceIntelligence(kycCase.id, {
    browserFingerprint: String(body.browserFingerprint ?? ""),
    ipAddress,
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
    case: updatedCase,
    caseId: updatedCase?.id,
    deviceIntelligence: updatedCase?.deviceIntelligence,
  });
}
