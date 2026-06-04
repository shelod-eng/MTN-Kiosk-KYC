import { NextRequest, NextResponse } from "next/server";
import { resolveWhat3Words } from "@/lib/provider-adapters";
import { captureLocation, getCaseBySessionToken } from "@/lib/whatsapp-store";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const kycCase = await getCaseBySessionToken(token);
  if (!kycCase) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  const body = (await request.json()) as { latitude?: number; longitude?: number; accuracy?: number };
  if (body.latitude === undefined || body.longitude === undefined) {
    return NextResponse.json({ error: "Missing coordinates." }, { status: 400 });
  }

  const what3words = await resolveWhat3Words({
    latitude: body.latitude,
    longitude: body.longitude,
  });

  const updatedCase = await captureLocation(kycCase.id, {
    latitude: body.latitude,
    longitude: body.longitude,
    accuracy: body.accuracy,
    what3words,
    capturedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    caseId: updatedCase?.id,
    case: updatedCase,
    what3words,
    location: updatedCase?.geoCapture,
  });
}
