/**
 * POST /api/whatsapp/inbound
 *
 * Twilio BSP inbound webhook for WhatsApp number +27695831160.
 *
 * Twilio sends application/x-www-form-urlencoded with fields:
 *   From        — whatsapp:+27821234567
 *   To          — whatsapp:+27695831160
 *   Body        — message text
 *   MessageSid  — unique message ID
 *   NumMedia    — number of media attachments
 *
 * Configure this URL in Twilio Console:
 *   Messaging → WhatsApp → Senders → +27695831160
 *   Webhook URL: https://<your-ngrok-or-vercel-url>/api/whatsapp/inbound
 *   HTTP Method: POST
 */

import { NextRequest, NextResponse } from "next/server";
import {
  describeWhatsAppSenderMapping,
  getLogicalWabaNumber,
  isAcceptedInboundRecipient,
  validateTwilioSignature,
  normaliseTwilioNumber,
} from "@/lib/twilio-whatsapp";
import { routeInboundMessage } from "@/lib/inbound-router";
import { recordInboundWebhookEvent } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  // -------------------------------------------------------------------------
  // 1. Parse Twilio's form-encoded payload
  // -------------------------------------------------------------------------
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "Unexpected content-type." }, { status: 415 });
  }

  const formText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(formText).entries());

  const from: string = params["From"] ?? "";
  const to: string = params["To"] ?? "";
  const body: string = params["Body"] ?? "";
  const messageSid: string = params["MessageSid"] ?? "";
  const mediaCount = Number(params["NumMedia"] ?? 0);
  const media = Array.from({ length: Number.isFinite(mediaCount) ? mediaCount : 0 }, (_, index) => ({
    url: params[`MediaUrl${index}`] ?? "",
    contentType: params[`MediaContentType${index}`] ?? undefined,
  })).filter((item) => item.url);

  if (!from || !to || (!body && media.length === 0)) {
    return NextResponse.json({ error: "Missing From, To, Body, or MediaUrl." }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // 2. Validate Twilio request signature
  // -------------------------------------------------------------------------
  const twilioSignature = request.headers.get("x-twilio-signature") ?? "";
  const requestUrl = request.url;

  const isValid = await validateTwilioSignature(requestUrl, params, twilioSignature);
  if (!isValid) {
    console.warn(`[inbound] Signature validation failed for MessageSid=${messageSid}`);
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Route the message through the KYC conversation state machine
  // -------------------------------------------------------------------------
  const msisdn = normaliseTwilioNumber(from);
  const inboundTo = normaliseTwilioNumber(to);
  const logicalTo = normaliseTwilioNumber(getLogicalWabaNumber());
  const mapping = describeWhatsAppSenderMapping();
  const eventBase = {
    messageSid: messageSid || `no-sid-${Date.now()}`,
    from: msisdn,
    transportTo: inboundTo,
    logicalTo,
    bodyPreview: body.slice(0, 160),
    mediaCount: media.length,
  };

  if (!isAcceptedInboundRecipient(to)) {
    console.warn(
      `[inbound] Ignoring MessageSid=${messageSid}; expected To=${mapping.transportSender} or ${mapping.logicalSender}, received To=${to}`
    );
    await recordInboundWebhookEvent({
      ...eventBase,
      status: "ignored",
      reason: `Unexpected recipient. Expected ${mapping.transportSender} or ${mapping.logicalSender}.`,
    });
    return new NextResponse("", { status: 200 });
  }

  console.log(
    `[inbound] MessageSid=${messageSid} from=${msisdn} transportTo=${inboundTo} logicalTo=${logicalTo} body="${body}"`
  );

  try {
    const routedCase = await routeInboundMessage(msisdn, body, media);
    await recordInboundWebhookEvent({
      ...eventBase,
      status: "routed",
      caseId: routedCase?.id,
      caseReference: routedCase?.reference,
    });
  } catch (error) {
    console.error(`[inbound] routeInboundMessage error for ${msisdn}:`, error);
    // Return 200 to Twilio so it does not retry — we log the error internally
    return new NextResponse("", { status: 200 });
  }

  // -------------------------------------------------------------------------
  // 4. Return empty 200 — Twilio requires a 200 to acknowledge receipt
  //    Outbound replies are sent via the REST API, not TwiML here.
  // -------------------------------------------------------------------------
  return new NextResponse("", { status: 200 });
}


