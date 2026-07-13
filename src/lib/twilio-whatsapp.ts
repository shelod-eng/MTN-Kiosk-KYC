/**
 * Twilio WhatsApp BSP client.
 *
 * UAT supports a two-number model:
 * - transport sender: Twilio Sandbox, currently whatsapp:+14155238886
 * - logical sender: mocked Meta WABA/RICA line, whatsapp:+27695831160
 *
 * Production collapses these into the live WABA sender.
 */

import { recordWhatsAppMessageTrace } from "@/lib/whatsapp-store";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+27695831160";
const TWILIO_SANDBOX_WHATSAPP_NUMBER = process.env.TWILIO_SANDBOX_WHATSAPP_NUMBER ?? "whatsapp:+14155238886";
const MOCK_WABA_NUMBER = process.env.MOCK_WABA_NUMBER ?? "whatsapp:+27695831160";
const WHATSAPP_TRANSPORT_MODE = (process.env.WHATSAPP_TRANSPORT_MODE ?? "production").toLowerCase();

export type WhatsAppDeliveryResult = {
  sid: string;
  status: string;
  transportSender: string;
  logicalSender: string;
};

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  trace?: { caseId?: string; caseReference?: string; purpose?: string }
): Promise<WhatsAppDeliveryResult> {
  const transportSender = getTwilioWhatsAppTransportSender();
  const logicalSender = getLogicalWabaNumber();
  const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log(`[twilio-mock] ${logicalSender} via ${transportSender} -> ${to}: ${body}`);
    const result = { sid: `mock-${Date.now()}`, status: "mock-sent", transportSender, logicalSender };
    await recordWhatsAppMessageTrace({
      direction: "outbound",
      provider: "twilio-mock",
      messageSid: result.sid,
      caseId: trace?.caseId,
      caseReference: trace?.caseReference,
      from: logicalSender,
      to: normalizedTo,
      transportSender,
      logicalSender,
      bodyPreview: body.slice(0, 160),
      status: result.status,
      reason: trace?.purpose,
    });
    return result;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({
    From: transportSender,
    To: normalizedTo,
    Body: body,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Twilio send failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { sid: string; status: string };
  const result = { sid: json.sid, status: json.status, transportSender, logicalSender };
  await recordWhatsAppMessageTrace({
    direction: "outbound",
    provider: "twilio",
    messageSid: result.sid,
    caseId: trace?.caseId,
    caseReference: trace?.caseReference,
    from: logicalSender,
    to: normalizedTo,
    transportSender,
    logicalSender,
    bodyPreview: body.slice(0, 160),
    status: result.status,
    reason: trace?.purpose,
  });
  return result;
}

export async function validateTwilioSignature(
  requestUrl: string,
  params: Record<string, string>,
  twilioSignature: string
): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) {
    return true;
  }

  const sortedKeys = Object.keys(params).sort();
  const stringToSign = requestUrl + sortedKeys.map((key) => `${key}${params[key]}`).join("");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TWILIO_AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(stringToSign));
  const computed = Buffer.from(signature).toString("base64");

  return computed === twilioSignature;
}

export function normaliseTwilioNumber(from: string): string {
  return from.replace(/^whatsapp:/i, "").trim();
}

export function getTwilioWhatsAppSender() {
  return getLogicalWabaNumber();
}

export function getLogicalWabaNumber() {
  return asWhatsAppNumber(WHATSAPP_TRANSPORT_MODE === "sandbox" ? MOCK_WABA_NUMBER : TWILIO_WHATSAPP_NUMBER);
}

export function getTwilioWhatsAppTransportSender() {
  return asWhatsAppNumber(WHATSAPP_TRANSPORT_MODE === "sandbox" ? TWILIO_SANDBOX_WHATSAPP_NUMBER : TWILIO_WHATSAPP_NUMBER);
}

export function isAcceptedInboundRecipient(to: string) {
  const inboundTo = normaliseTwilioNumber(to);
  const transportTo = normaliseTwilioNumber(getTwilioWhatsAppTransportSender());
  const logicalTo = normaliseTwilioNumber(getLogicalWabaNumber());
  return inboundTo === transportTo || inboundTo === logicalTo;
}

export function describeWhatsAppSenderMapping() {
  return {
    mode: WHATSAPP_TRANSPORT_MODE,
    transportSender: getTwilioWhatsAppTransportSender(),
    logicalSender: getLogicalWabaNumber(),
  };
}

function asWhatsAppNumber(value: string) {
  const sender = value.trim();
  if (!sender) return "whatsapp:+27695831160";
  return sender.startsWith("whatsapp:") ? sender : `whatsapp:${sender}`;
}



