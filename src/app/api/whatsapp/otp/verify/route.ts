import { NextRequest, NextResponse } from "next/server";
import { verifyOtpWithProvider } from "@/lib/provider-adapters";
import { upsertOtp } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string; code?: string; attempts?: number };
  if (!body.caseId || !body.code) {
    return NextResponse.json({ error: "Missing caseId or code." }, { status: 400 });
  }

  const verification = await verifyOtpWithProvider({
    caseId: body.caseId,
    code: body.code,
  });

  if (!verification.approved) {
    return NextResponse.json({ error: "OTP verification failed.", verified: false }, { status: 400 });
  }

  const updatedCase = await upsertOtp(body.caseId, "verify", Number(body.attempts ?? 1));
  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    verified: true,
    provider: verification.provider,
    providerReference: verification.reference,
    otp: updatedCase.verification.otp,
  });
}
