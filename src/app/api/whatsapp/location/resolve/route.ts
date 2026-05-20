import { NextRequest, NextResponse } from "next/server";
import { resolveWhat3Words } from "@/lib/provider-adapters";
import { captureLocation } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    caseId?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };

  if (!body.caseId || body.latitude === undefined || body.longitude === undefined) {
    return NextResponse.json({ error: "Missing caseId or coordinates." }, { status: 400 });
  }

  const what3words = await resolveWhat3Words({
    latitude: body.latitude,
    longitude: body.longitude,
  });
  const updatedCase = await captureLocation(body.caseId, {
    latitude: body.latitude,
    longitude: body.longitude,
    accuracy: body.accuracy,
    what3words,
    capturedAt: new Date().toISOString(),
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    location: updatedCase.geoCapture,
    what3words,
  });
}
