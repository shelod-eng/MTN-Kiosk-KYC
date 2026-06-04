import { NextRequest, NextResponse } from "next/server";
import { createCase, createCaseSession, getCase } from "@/lib/whatsapp-store";
import { requirePermission } from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:initiate");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body = (await request.json()) as {
    tenant?: "MTN" | "Vodacom" | "Cell C";
    customerPhoneNumber?: string;
    deliveryMethod?: "whatsapp" | "qr";
    notes?: string;
  };

  if (!body.tenant || !body.customerPhoneNumber || !body.deliveryMethod) {
    return NextResponse.json({ error: "Missing required staff initiation fields." }, { status: 400 });
  }

  const kycCase = await createCase({
    staffId: auth.context.staffId,
    staffName: auth.context.staffName,
    staffRole: auth.context.staffRole,
    tenant: body.tenant,
    customerPhoneNumber: body.customerPhoneNumber,
    deliveryMethod: body.deliveryMethod,
    notes: body.notes,
  });
  const session = await createCaseSession(kycCase.id);
  const sessionReadyCase = (await getCase(kycCase.id)) ?? kycCase;

  return NextResponse.json({
    case: sessionReadyCase,
    secureSession: session,
    initiatedBy: auth.context,
    messageTemplate:
      body.deliveryMethod === "qr"
        ? "Scan this QR code to continue your KYC-Now verification."
        : "Tap the secure link to continue your KYC-Now verification on WhatsApp.",
  });
}
