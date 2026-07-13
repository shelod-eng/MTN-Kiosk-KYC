import { NextRequest, NextResponse } from "next/server";
import { generateOtpCode, hashOtpCode, sendOtpWithProvider } from "@/lib/provider-adapters";
import { getCase, saveCaseSnapshot, upsertOtp } from "@/lib/whatsapp-store";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    caseId?: string;
    provider?: "twilio-verify" | "netcash";
    caseSnapshot?: WhatsAppKycCase;
  };
  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  let current = await getCase(body.caseId);
  if (!current && body.caseSnapshot?.id === body.caseId) {
    current = await saveCaseSnapshot(body.caseSnapshot);
  }

  if (!current) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const code = generateOtpCode();
  const providerResult = await sendOtpWithProvider({
    caseId: body.caseId,
    phoneNumber: current.applicant.phoneNumber ?? current.staffInitiation.customerPhoneNumber,
    code,
    reference: current.reference,
  });
  const updatedCase = await upsertOtp(body.caseId, "send", 1, {
    codeHash: hashOtpCode(body.caseId, code),
    provider: providerResult.provider,
    providerReference: providerResult.reference,
    transportSender: providerResult.transportSender,
    logicalSender: providerResult.logicalSender,
  });

  return NextResponse.json({
    case: updatedCase,
    provider: providerResult.provider,
    providerReference: providerResult.reference,
    transportSender: providerResult.transportSender,
    logicalSender: providerResult.logicalSender,
    devOtp: providerResult.status === "mock-sent" || providerResult.provider === "twilio-sandbox" ? code : undefined,
    otp: updatedCase.verification.otp,
    status: updatedCase.status,
  });
}
