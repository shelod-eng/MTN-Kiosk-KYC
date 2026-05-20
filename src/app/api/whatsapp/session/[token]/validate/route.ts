import { NextRequest, NextResponse } from "next/server";
import { getCaseBySessionToken } from "@/lib/whatsapp-store";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const kycCase = await getCaseBySessionToken(token);

  if (!kycCase) {
    return NextResponse.json({ valid: false, error: "Session not found or expired." }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    caseId: kycCase.id,
    reference: kycCase.reference,
    allowedSteps: ["selfie", "device", "location", "affidavit"],
    expiresAt: kycCase.secureSessionExpiresAt,
  });
}
