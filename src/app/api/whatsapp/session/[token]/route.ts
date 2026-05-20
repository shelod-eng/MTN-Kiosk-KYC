import { NextRequest, NextResponse } from "next/server";
import { getCaseBySessionToken } from "@/lib/whatsapp-store";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const kycCase = await getCaseBySessionToken(token);

  if (!kycCase) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  return NextResponse.json({
    case: kycCase,
    nextSteps: ["selfie", "device-intelligence", "location", "affidavit"],
  });
}
