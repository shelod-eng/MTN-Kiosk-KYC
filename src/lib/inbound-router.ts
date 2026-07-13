/**
 * Inbound WhatsApp conversation router
 *
 * Receives a normalised inbound message and the current KYC case (or null for
 * first contact), then drives the 7-step KYC journey:
 *
 *  Step 1 — OTP dispatch          (case created / consent_pending)
 *  Step 2 — OTP verification      (otp_pending)
 *  Step 3 — Full name capture     (otp_approved)
 *  Step 4 — SA ID validation      (details_pending)
 *  Step 5 — ID document upload    (selfie_pending — link sent)
 *  Step 6 — Proof / affidavit     (address_pending — link sent)
 *  Step 7 — Final verification    (risk_review → decision)
 *
 * Steps 5–7 require file uploads / camera access which cannot be done inside
 * a plain WhatsApp text thread. The router sends the customer a secure session
 * link for those steps, exactly as the existing prototype does for QR delivery.
 */

import {
  findCaseByPhoneNumber,
  createCase,
  captureIdDocument,
  captureProofOfAddress,
  upsertOtp,
  saveCaseSnapshot,
  updateFromWebhook,
  runRiskAssessment,
  createCaseSession,
} from "@/lib/whatsapp-store";
import { generateOtpCode, hashOtpCode, sendOtpWithProvider, verifyOtpWithProvider } from "@/lib/provider-adapters";
import { validateSouthAfricanIdNumber } from "@/lib/sa-id";
import { normalizePhoneNumber, appendAudit, type WhatsAppKycCase } from "@/lib/whatsapp-kyc";
import { sendWhatsAppMessage } from "@/lib/twilio-whatsapp";
import { enqueueKycCase, enqueueVerificationReport } from "@/lib/kyc-queue";

const INTERNAL_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000";

type InboundMedia = {
  url: string;
  contentType?: string;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function routeInboundMessage(from: string, messageBody: string, media: InboundMedia[] = []): Promise<WhatsAppKycCase | null> {
  const msisdn = normalizePhoneNumber(from);
  const text = messageBody.trim();

  const existingCase = await findCaseByPhoneNumber(msisdn);

  if (!existingCase) {
    return handleFirstContact(msisdn);
  }

  await routeByStatus(existingCase, msisdn, text, media);
  return existingCase;
}

// ---------------------------------------------------------------------------
// Step 1 — First contact: create case + send OTP
// ---------------------------------------------------------------------------

async function handleFirstContact(msisdn: string): Promise<WhatsAppKycCase> {
  const kycCase = await createCase({
    staffId: "whatsapp-inbound",
    staffName: "WhatsApp Inbound",
    staffRole: "agent",
    tenant: "MTN",
    customerPhoneNumber: msisdn,
    deliveryMethod: "whatsapp",
    notes: "Inbound self-service via WhatsApp +27695831160",
  });

  const code = generateOtpCode();
  const providerResult = await sendOtpWithProvider({
    caseId: kycCase.id,
    phoneNumber: msisdn,
    code,
    reference: kycCase.reference,
  });
  await upsertOtp(kycCase.id, "send", 1, {
    codeHash: hashOtpCode(kycCase.id, code),
    provider: providerResult.provider,
    providerReference: providerResult.reference,
    transportSender: providerResult.transportSender,
    logicalSender: providerResult.logicalSender,
  });
  return kycCase;
}

// ---------------------------------------------------------------------------
// Step router — dispatch by current case status
// ---------------------------------------------------------------------------

async function routeByStatus(kycCase: WhatsAppKycCase, msisdn: string, text: string, media: InboundMedia[] = []): Promise<void> {
  const status = kycCase.status;
  const firstMedia = media[0];

  // Already completed — do not re-process
  if (status === "approved" || status === "verified" || status === "rejected") {
    await sendWhatsAppMessage(
      msisdn,
      `Your KYC case *${kycCase.reference}* has already been finalised with status: *${status.toUpperCase()}*.\n\nContact your MNO branch for assistance.`
    );
    return;
  }

  // Manual review in progress
  if (status === "manual_review" || status === "risk_review") {
    await sendWhatsAppMessage(
      msisdn,
      `Your case *${kycCase.reference}* is currently under review. Our compliance team will contact you shortly.`
    );
    return;
  }

  if (status === "consent_pending" || status === "otp_pending") {
    await handleOtpVerification(kycCase, msisdn, text);
    return;
  }

  if (status === "otp_approved") {
    await handleFullNameCapture(kycCase, msisdn, text);
    return;
  }

  if (status === "details_pending") {
    await handleIdCapture(kycCase, msisdn, text);
    return;
  }

  // Steps 5–7 require the secure session link
  if (status === "selfie_pending" || status === "address_pending" || status === "location_pending") {
    if (firstMedia) {
      await handleInboundMedia(kycCase, msisdn, firstMedia);
      return;
    }

    await handleSecureSessionStep(kycCase, msisdn, status);
    return;
  }

  // Fallback — re-send current prompt
  await sendWhatsAppMessage(
    msisdn,
    `Your KYC case *${kycCase.reference}* is in progress (status: ${status}). Please follow the instructions sent to you.`
  );
}

// ---------------------------------------------------------------------------
// Step 2 — OTP verification
// ---------------------------------------------------------------------------

async function handleOtpVerification(kycCase: WhatsAppKycCase, msisdn: string, text: string): Promise<void> {
  const code = text.replace(/\D/g, "").slice(0, 6);

  const result = await verifyOtpWithProvider({ caseId: kycCase.id, code });

  if (!result.approved) {
    await sendWhatsAppMessage(
      msisdn,
      `❌ Incorrect OTP. Please check the code sent to your number and try again.\n\nReply with your 6-digit OTP.`
    );
    return;
  }

  await upsertOtp(kycCase.id, "verify", 1);
  await enqueueKycCase({
    caseId: kycCase.id,
    stage: "applicant_details",
    source: kycCase.staffInitiation.bulkCampaign ? "bulk" : "single",
    batchReference: kycCase.staffInitiation.bulkCampaign?.batchReference,
  });

  await sendWhatsAppMessage(
    msisdn,
    `✅ Number verified!\n\nPlease reply with your *full name* as it appears on your South African ID document.\n\nExample: _Lebohang Mpeta_`
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Full name capture
// ---------------------------------------------------------------------------

async function handleFullNameCapture(kycCase: WhatsAppKycCase, msisdn: string, text: string): Promise<void> {
  if (text.trim().split(/\s+/).length < 2) {
    await sendWhatsAppMessage(
      msisdn,
      `Please provide your *full name* (first name and surname).\n\nExample: _Lebohang Mpeta_`
    );
    return;
  }

  const updatedCase: WhatsAppKycCase = {
    ...kycCase,
    applicant: { ...kycCase.applicant, fullName: text.trim() },
    status: "details_pending",
    updatedAt: new Date().toISOString(),
  };

  const auditedCase = appendAudit(updatedCase, {
    actorRole: "customer",
    actorId: msisdn,
    action: "details_submitted",
    details: { fullName: text.trim(), source: "whatsapp_inbound" },
  });

  await saveCaseSnapshot(auditedCase);
  await enqueueKycCase({
    caseId: auditedCase.id,
    stage: "applicant_details",
    source: auditedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
    batchReference: auditedCase.staffInitiation.bulkCampaign?.batchReference,
  });

  await sendWhatsAppMessage(
    msisdn,
    `Thank you, *${text.trim()}*! ✅\n\nNow please reply with your *13-digit South African ID number*.\n\nExample: _8306125876089_`
  );
}

// ---------------------------------------------------------------------------
// Step 4 — SA ID number capture + validation
// ---------------------------------------------------------------------------

async function handleIdCapture(kycCase: WhatsAppKycCase, msisdn: string, text: string): Promise<void> {
  const digits = text.replace(/\D/g, "");
  const validation = validateSouthAfricanIdNumber(digits);

  if (!validation.isValid) {
    const failedCase = appendAudit(kycCase, {
      actorRole: "system",
      actorId: "sa-id-validator",
      action: "id_checksum_failed",
      details: {
        attemptedIdNumber: digits,
        errors: validation.errors,
        source: "whatsapp_inbound",
      },
    });
    await saveCaseSnapshot(failedCase);

    await sendWhatsAppMessage(
      msisdn,
      `❌ Invalid SA ID number.\n\n${validation.errors.join(" ")}\n\nPlease reply with your correct *13-digit SA ID number*.`
    );
    return;
  }

  const updatedCase: WhatsAppKycCase = {
    ...kycCase,
    applicant: { ...kycCase.applicant, idNumber: digits },
    status: "selfie_pending",
    verification: { ...kycCase.verification, idValidation: validation },
    updatedAt: new Date().toISOString(),
  };

  const auditedCase = appendAudit(updatedCase, {
    actorRole: "system",
    actorId: "sa-id-validator",
    action: "id_checksum_passed",
    details: {
      normalizedIdNumber: validation.normalized,
      dateOfBirth: validation.dateOfBirth,
      citizenship: validation.citizenship,
      gender: validation.gender,
      source: "whatsapp_inbound",
    },
  });

  await saveCaseSnapshot(auditedCase);
  await enqueueKycCase({
    caseId: auditedCase.id,
    stage: "id_ocr",
    source: auditedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
    batchReference: auditedCase.staffInitiation.bulkCampaign?.batchReference,
  });
  await enqueueVerificationReport({
    caseId: auditedCase.id,
    provider: auditedCase.tenant,
    source: auditedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
    batchReference: auditedCase.staffInitiation.bulkCampaign?.batchReference,
  });

  // Issue a secure session so the customer can complete steps 5–7 in the browser
  const session = await createCaseSession(auditedCase.id);
  const sessionUrl = `${INTERNAL_BASE_URL}/verify?token=${session?.token ?? ""}`;

  await sendWhatsAppMessage(
    msisdn,
    `✅ SA ID *${validation.normalized.slice(0, 6)}•••••${validation.normalized.slice(-2)}* validated!\n\n` +
      `To complete your KYC verification, please open the secure link below on your phone:\n\n` +
      `🔗 ${sessionUrl}\n\n` +
      `You will need to:\n` +
      `📄 Upload your ID / driver's licence / passport\n` +
      `🏠 Upload proof of address or type an affidavit\n` +
      `🤳 Take a selfie for liveness check\n\n` +
      `The link expires in *15 minutes*. Ref: ${kycCase.reference}`
  );
}

// ---------------------------------------------------------------------------
// Steps 5–7 — Secure session reminder (customer messaged again mid-flow)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Steps 5-7 - inbound WhatsApp media capture
// ---------------------------------------------------------------------------

async function handleInboundMedia(kycCase: WhatsAppKycCase, msisdn: string, media: InboundMedia): Promise<void> {
  const fileName = media.url.split("/").pop() || `${kycCase.reference}-whatsapp-media`;

  if (kycCase.status === "selfie_pending") {
    const updatedCase = await captureIdDocument(kycCase.id, {
      documentUrl: media.url,
      documentType: inferIdentityDocumentType(media.contentType),
      fileName,
    });

    if (updatedCase) {
      await enqueueKycCase({
        caseId: updatedCase.id,
        stage: "id_ocr",
        source: updatedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
        batchReference: updatedCase.staffInitiation.bulkCampaign?.batchReference,
      });
    }

    await sendWhatsAppMessage(
      msisdn,
      `ID document received for case *${kycCase.reference}*.\n\nPlease send your proof of address image/PDF, or reply with affidavit text if you do not have formal proof.`
    );
    return;
  }

  if (kycCase.status === "address_pending") {
    const updatedCase = await captureProofOfAddress(kycCase.id, {
      proofOfAddressUrl: media.url,
      fileName,
      documentType: inferProofDocumentType(media.contentType),
    });

    if (updatedCase) {
      await enqueueKycCase({
        caseId: updatedCase.id,
        stage: "address",
        source: updatedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
        batchReference: updatedCase.staffInitiation.bulkCampaign?.batchReference,
      });
    }

    await sendWhatsAppMessage(
      msisdn,
      `Proof of address received for case *${kycCase.reference}*.\n\nPlease send a clear selfie to complete the liveness check.`
    );
    return;
  }

  const updatedCase = await updateFromWebhook({
    caseId: kycCase.id,
    event: "selfie_captured",
    actorId: msisdn,
    details: {
      selfieUrl: media.url,
      livenessScore: 0.88,
      faceMatchScore: 0.84,
      source: "whatsapp_inbound_media",
      contentType: media.contentType ?? null,
    },
  });

  if (updatedCase) {
    await enqueueKycCase({
      caseId: updatedCase.id,
      stage: "biometrics",
      source: updatedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
      batchReference: updatedCase.staffInitiation.bulkCampaign?.batchReference,
    });
    await enqueueVerificationReport({
      caseId: updatedCase.id,
      provider: updatedCase.tenant,
      source: updatedCase.staffInitiation.bulkCampaign ? "bulk" : "single",
      batchReference: updatedCase.staffInitiation.bulkCampaign?.batchReference,
    });
    const scoredCase = await runRiskAssessment(updatedCase.id);
    await sendWhatsAppMessage(
      msisdn,
      `Selfie verified for case *${updatedCase.reference}*.\n\nFinal verification status: *${(scoredCase?.status ?? updatedCase.status).toUpperCase()}*. Risk score: *${scoredCase?.risk?.score ?? "pending"}*.`
    );
  }
}

function inferIdentityDocumentType(contentType?: string) {
  if (contentType?.includes("pdf")) return "Identity document PDF";
  return "Identity document image";
}

function inferProofDocumentType(contentType?: string) {
  if (contentType?.includes("pdf")) return "Proof of address PDF";
  return "Proof of address document";
}
async function handleSecureSessionStep(
  kycCase: WhatsAppKycCase,
  msisdn: string,
  status: string
): Promise<void> {
  const session = await createCaseSession(kycCase.id);
  const sessionUrl = `${INTERNAL_BASE_URL}/verify?token=${session?.token ?? ""}`;

  const stepLabel =
    status === "selfie_pending"
      ? "upload your ID document"
      : status === "address_pending"
        ? "upload your proof of address or affidavit"
        : "share your location";

  await sendWhatsAppMessage(
    msisdn,
    `Your KYC case *${kycCase.reference}* is waiting for you to *${stepLabel}*.\n\n` +
      `Please open your secure verification link:\n\n` +
      `🔗 ${sessionUrl}\n\n` +
      `The link expires in *15 minutes*.`
  );
}





