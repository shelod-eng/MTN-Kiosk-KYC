import { NextRequest, NextResponse } from "next/server";
import { updateFromWebhook } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string; proofOfAddressUrl?: string; fileName?: string };
  if (!body.caseId || !body.proofOfAddressUrl) {
    return NextResponse.json({ error: "Missing caseId or proofOfAddressUrl." }, { status: 400 });
  }

  const updatedCase = await updateFromWebhook({
    caseId: body.caseId,
    event: "address_submitted",
    actorId: "secure-session",
    details: {
      proofOfAddressUrl: body.proofOfAddressUrl,
      fileName: body.fileName ?? "proof-of-address.pdf",
    },
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    caseId: updatedCase.id,
    status: updatedCase.status,
    proofOfAddressUrl: updatedCase.documentUrls.proofOfAddress,
  });
}
