import { NextRequest, NextResponse } from "next/server";
import { captureDeviceIntelligence, getCase, getCaseBySessionToken } from "@/lib/whatsapp-store";

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

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  const clientIp = request.headers.get("x-client-ip")?.trim();
  const forwarded = request.headers.get("forwarded")?.match(/for="?([^";,]+)"?/i)?.[1];
  const remoteAddr = typeof (request as unknown as { ip?: string }).ip === "string" ? (request as unknown as { ip: string }).ip : undefined;
  const candidateIps = [forwardedFor, vercelForwardedFor, realIp, cloudflareIp, clientIp, forwarded, remoteAddr].filter(Boolean);
  const validPublicIp = candidateIps.find((ip) => isValidPublicIp(ip));

  return validPublicIp || candidateIps[0] || "local-dev";
}

export async function POST(request: NextRequest, context: LocalRouteContext) {
  const { token } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const fallbackCaseId = typeof body.caseId === "string" ? body.caseId : "";
  const kycCase = (await getCaseBySessionToken(token)) ?? (fallbackCaseId ? await getCase(fallbackCaseId) : null);
  if (!kycCase) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  const ipAddress = String(body.ipAddress ?? "") || getRequestIp(request);
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
