import { NextRequest, NextResponse } from "next/server";
import { getQueueSnapshot } from "@/lib/kyc-queue";
import { getPersistenceMode, listBulkBatches, listCases, listWhatsAppMessageTraces } from "@/lib/whatsapp-store";
import { describeWhatsAppSenderMapping } from "@/lib/twilio-whatsapp";
import { requirePermission } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const [cases, bulkBatches, queue, whatsappTraces] = await Promise.all([listCases(), listBulkBatches(), getQueueSnapshot(), listWhatsAppMessageTraces()]);
  const whatsappMapping = describeWhatsAppSenderMapping();
  const inboundTraces = whatsappTraces.filter((trace) => trace.direction === "inbound");
  const outboundTraces = whatsappTraces.filter((trace) => trace.direction === "outbound");
  const configuredWaba = whatsappMapping.logicalSender;

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      requestedBy: auth.context,
      persistenceMode: getPersistenceMode(),
      cases,
      bulkBatches,
      queue,
      connectivity: {
        waba: {
          displayNumber: "069 583 1160",
          e164: "+27695831160",
          configuredNumber: configuredWaba,
          configured: configuredWaba.replace(/\D/g, "").endsWith("27695831160"),
          connected: inboundTraces.length > 0,
          lastInboundAt: inboundTraces[0]?.occurredAt ?? null,
        },
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.slice(0, 6)}...${process.env.TWILIO_ACCOUNT_SID.slice(-4)}` : "Not configured",
          webhookEndpoint: "/api/whatsapp/inbound",
          testEndpoint: "/api/whatsapp/connectivity-test",
          transportSender: whatsappMapping.transportSender,
          logicalSender: whatsappMapping.logicalSender,
          mode: whatsappMapping.mode,
          lastOutboundAt: outboundTraces[0]?.occurredAt ?? null,
        },
        inboundTraffic: inboundTraces.slice(0, 12),
        messageTraces: whatsappTraces.slice(0, 20),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}


