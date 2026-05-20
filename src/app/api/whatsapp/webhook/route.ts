import { NextRequest, NextResponse } from "next/server";
import { updateFromWebhook } from "@/lib/whatsapp-store";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp-kyc";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as WhatsAppWebhookPayload;

  if (!body.caseId || !body.event) {
    return NextResponse.json({ error: "Missing caseId or event." }, { status: 400 });
  }

  const updatedCase = await updateFromWebhook(body);

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    nextStatus: updatedCase.status,
    auditEntries: updatedCase.auditTrail.slice(-3),
  });
}
