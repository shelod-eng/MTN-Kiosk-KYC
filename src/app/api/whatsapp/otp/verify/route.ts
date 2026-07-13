import { NextRequest, NextResponse } from "next/server";
import { verifyOtpWithProvider } from "@/lib/provider-adapters";
import { getCase, saveCaseSnapshot, upsertOtp } from "@/lib/whatsapp-store";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string; code?: string; attempts?: number; caseSnapshot?: WhatsAppKycCase };
  if (!body.caseId || !body.code) {
    return NextResponse.json({ error: "Missing caseId or code." }, { status: 400 });
  }

  const current = await getCase(body.caseId);
  const snapshotHasOtp = Boolean(body.caseSnapshot?.verification.otp?.codeHash);
  if (body.caseSnapshot?.id === body.caseId && (!current || (!current.verification.otp?.codeHash && snapshotHasOtp))) {
    await saveCaseSnapshot(body.caseSnapshot);
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
    case: updatedCase,
    verified: true,
    provider: verification.provider,
    providerReference: verification.reference,
    otp: updatedCase.verification.otp,
  });
}
