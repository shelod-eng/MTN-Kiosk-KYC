import { NextRequest, NextResponse } from "next/server";
import { describeWhatsAppSenderMapping } from "@/lib/twilio-whatsapp";

export async function POST(request: NextRequest) {
  const mapping = describeWhatsAppSenderMapping();
  return NextResponse.json({
    ok: true,
    status: "200 OK",
    checkedAt: new Date().toISOString(),
    webhookEndpoint: "/api/whatsapp/inbound",
    requestUrl: request.url,
    twilio: mapping,
  });
}
