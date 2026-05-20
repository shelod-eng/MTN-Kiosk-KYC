import { NextRequest, NextResponse } from "next/server";
import { sendOtpWithProvider } from "@/lib/provider-adapters";
import { upsertOtp } from "@/lib/whatsapp-store";
import { getCase } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string; provider?: "twilio-verify" | "netcash" };
  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const current = await getCase(body.caseId);
  if (!current) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const updatedCase = await upsertOtp(body.caseId, "send", 1);
  const providerResult = await sendOtpWithProvider({
    caseId: body.caseId,
    phoneNumber: current.applicant.phoneNumber ?? current.staffInitiation.customerPhoneNumber,
  });

  return NextResponse.json({
    provider: providerResult.provider,
    providerReference: providerResult.reference,
    otp: updatedCase.verification.otp,
    status: updatedCase.status,
  });
}
