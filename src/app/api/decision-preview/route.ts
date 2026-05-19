import { NextRequest, NextResponse } from "next/server";
import { computeDecision } from "@/lib/mock-data";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const decision = computeDecision({
    dhaVerified: Boolean(body.dhaVerified),
    ocrConfidence: Number(body.ocrConfidence),
    transunionScore: Number(body.transunionScore),
    experianBand: body.experianBand,
    liveness: Number(body.liveness),
  });

  return NextResponse.json({
    decision,
    source: "mock DMN preview",
  });
}
