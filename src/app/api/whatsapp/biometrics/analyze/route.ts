import { NextRequest, NextResponse } from "next/server";
import { runBiometricProvider } from "@/lib/provider-adapters";
import { captureDeviceIntelligence, updateFromWebhook } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    caseId?: string;
    selfieUrl?: string;
    idDocumentUrl?: string;
  };

  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const result = await runBiometricProvider({
    caseId: body.caseId,
    selfieUrl: body.selfieUrl,
    idDocumentUrl: body.idDocumentUrl,
  });

  await captureDeviceIntelligence(body.caseId, {
    ipAddress: getRequestIp(request),
  });

  const updatedCase = await updateFromWebhook({
    caseId: body.caseId,
    event: "selfie_captured",
    actorId: "secure-session",
    details: {
      livenessScore: result.livenessScore,
      faceMatchScore: result.faceMatchScore,
      selfieUrl: body.selfieUrl ?? "secure-session-selfie-demo.jpg",
    },
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    provider: result.provider,
    providerReference: result.providerReference,
    livenessScore: result.livenessScore,
    faceMatchScore: result.faceMatchScore,
    status: updatedCase.status,
  });
}

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  const clientIp = request.headers.get("x-client-ip")?.trim();
  const forwarded = request.headers.get("forwarded")?.match(/for="?([^";,]+)"?/i)?.[1];
  const requestIp = typeof (request as unknown as { ip?: string }).ip === "string" ? (request as unknown as { ip: string }).ip : undefined;

  return forwardedFor || vercelForwardedFor || realIp || cloudflareIp || clientIp || forwarded || requestIp || "local-dev";
}
