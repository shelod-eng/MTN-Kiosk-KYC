import { NextRequest, NextResponse } from "next/server";
import { captureProofOfAddress } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string; proofOfAddressUrl?: string; fileName?: string; documentType?: string };
  if (!body.caseId || !body.proofOfAddressUrl) {
    return NextResponse.json({ error: "Missing caseId or proofOfAddressUrl." }, { status: 400 });
  }

  const updatedCase = await captureProofOfAddress(body.caseId, {
    proofOfAddressUrl: body.proofOfAddressUrl,
    fileName: body.fileName ?? "proof-of-address.pdf",
    documentType: body.documentType,
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    caseId: updatedCase.id,
    status: updatedCase.status,
    proofOfAddressUrl: updatedCase.documentUrls.proofOfAddress,
    proof: updatedCase.verification.proofOfAddressDocument,
    requiresAffidavitFallback: Boolean(updatedCase.verification.proofOfAddressDocument?.reviewReason),
    fallbackReason: updatedCase.verification.proofOfAddressDocument?.reviewReason ?? null,
  });
}
