import {
  applyWebhookEvent,
  appendAudit,
  canTransitionCase,
  calculateRiskAssessment,
  createSecureSession,
  createWhatsAppCase,
  exportAuditTrail,
  type AffidavitCapture,
  type DeviceIntelligence,
  type GeoCapture,
  type StaffInitiationPayload,
  summarizeCaseForReview,
  validateSecureSessionToken,
  type WhatsAppKycCase,
  type WhatsAppWebhookPayload,
} from "@/lib/whatsapp-kyc";
import { hasSupabaseConfig, supabaseRequest } from "@/lib/supabase-rest";
import { validateSouthAfricanIdNumber } from "@/lib/sa-id";
import type { BulkCampaignResult, BulkCampaignRow } from "@/lib/bulk-campaign";

type StoreShape = {
  cases: Map<string, WhatsAppKycCase>;
  sessions: Map<string, { caseId: string; expiresAt: string }>;
  bulkBatches: Map<string, BulkCampaignResult>;
};

const globalStore = globalThis as typeof globalThis & { __whatsappKycStore?: StoreShape };

function getMemoryStore() {
  if (!globalStore.__whatsappKycStore) {
    globalStore.__whatsappKycStore = {
      cases: new Map<string, WhatsAppKycCase>(),
      sessions: new Map<string, { caseId: string; expiresAt: string }>(),
      bulkBatches: new Map<string, BulkCampaignResult>(),
    };
  }

  return globalStore.__whatsappKycStore;
}

function mapCaseRow(row: Record<string, unknown>) {
  return (row.case_payload ?? null) as WhatsAppKycCase | null;
}

async function persistCase(kycCase: WhatsAppKycCase) {
  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    store.cases.set(kycCase.id, kycCase);
    if (kycCase.secureSessionToken && kycCase.secureSessionExpiresAt) {
      store.sessions.set(kycCase.secureSessionToken, {
        caseId: kycCase.id,
        expiresAt: kycCase.secureSessionExpiresAt,
      });
    }
    return kycCase;
  }

  await supabaseRequest("kyc_cases?on_conflict=id", {
    method: "POST",
    body: JSON.stringify([
      {
        id: kycCase.id,
        case_reference: kycCase.reference,
        tenant: kycCase.tenant,
        channel: kycCase.channel,
        status: kycCase.status,
        customer_phone_number: kycCase.applicant.phoneNumber ?? kycCase.staffInitiation.customerPhoneNumber,
        staff_id: kycCase.staffInitiation.staffId,
        staff_name: kycCase.staffInitiation.staffName,
        staff_role: kycCase.staffInitiation.staffRole,
        delivery_method: kycCase.staffInitiation.deliveryMethod,
        secure_session_token: kycCase.secureSessionToken ?? null,
        secure_session_expires_at: kycCase.secureSessionExpiresAt ?? null,
        risk_score: kycCase.risk?.score ?? null,
        risk_band: kycCase.risk?.band ?? null,
        decision: kycCase.risk?.decision ?? null,
        gps_coordinates: kycCase.residenceEvidence?.gpsCoordinates ?? null,
        what3words_id: kycCase.residenceEvidence?.what3wordsId ?? kycCase.geoCapture?.what3words ?? null,
        tower_id: kycCase.residenceEvidence?.towerId ?? kycCase.staffInitiation.bulkCampaign?.towerId ?? null,
        location_evidence: kycCase.residenceEvidence?.locationEvidence ?? kycCase.staffInitiation.bulkCampaign?.locationEvidence ?? null,
        affidavit_video_url: kycCase.residenceEvidence?.affidavitVideoUrl ?? kycCase.documentUrls.affidavitVideo ?? null,
        residence_evidence_captured_at: kycCase.residenceEvidence?.capturedAt ?? kycCase.geoCapture?.capturedAt ?? kycCase.affidavit?.capturedAt ?? null,
        updated_at: kycCase.updatedAt,
        case_payload: kycCase,
      },
    ]),
  });

  const idValidation = kycCase.applicant.idNumber ? validateSouthAfricanIdNumber(kycCase.applicant.idNumber) : null;
  await supabaseRequest("kyc_applicants?on_conflict=id", {
    method: "POST",
    body: JSON.stringify([
      {
        id: `applicant_${kycCase.id}`,
        case_id: kycCase.id,
        full_name: kycCase.applicant.fullName ?? null,
        id_number: kycCase.applicant.idNumber ?? null,
        phone_number: kycCase.applicant.phoneNumber ?? kycCase.staffInitiation.customerPhoneNumber,
        consent_given: Boolean(kycCase.applicant.consentGiven),
        consent_captured_at: kycCase.consentCapturedAt ?? null,
        date_of_birth: idValidation?.dateOfBirth ?? null,
        citizenship: idValidation?.citizenship ?? null,
        gender: idValidation?.gender ?? null,
        updated_at: kycCase.updatedAt,
      },
    ]),
  });

  if (kycCase.auditTrail.length > 0) {
    await supabaseRequest("kyc_audit_logs?on_conflict=id", {
      method: "POST",
      body: JSON.stringify(
        kycCase.auditTrail.map((entry) => ({
          id: entry.id,
          case_id: entry.caseId,
          actor_role: entry.actorRole,
          actor_id: entry.actorId,
          action: entry.action,
          details: {
            ...entry.details,
            eventTimestampUtc: entry.timestamp,
            immutableHash: entry.immutableHash,
          },
        }))
      ),
    });
  }

  return kycCase;
}

async function loadCase(caseId: string) {
  if (!hasSupabaseConfig()) {
    return getMemoryStore().cases.get(caseId) ?? null;
  }

  const rows = (await supabaseRequest(`kyc_cases?select=case_payload&id=eq.${encodeURIComponent(caseId)}`)) as Array<Record<string, unknown>>;
  return rows[0] ? mapCaseRow(rows[0]) : null;
}

async function loadCaseBySession(sessionToken: string) {
  const payload = validateSecureSessionToken(sessionToken);
  if (!payload) return null;

  if (!hasSupabaseConfig()) {
    const session = getMemoryStore().sessions.get(sessionToken);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) return null;
    return getMemoryStore().cases.get(session.caseId) ?? null;
  }

  const rows = (await supabaseRequest(
    `kyc_cases?select=case_payload,secure_session_expires_at&secure_session_token=eq.${encodeURIComponent(sessionToken)}`
  )) as Array<Record<string, unknown>>;
  const first = rows[0];
  if (!first) return null;
  const expiresAt = String(first.secure_session_expires_at ?? "");
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return null;
  return mapCaseRow(first);
}

export async function listCases() {
  if (!hasSupabaseConfig()) {
    return Array.from(getMemoryStore().cases.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const rows = (await supabaseRequest("kyc_cases?select=case_payload&order=updated_at.desc")) as Array<Record<string, unknown>>;
  return rows.map(mapCaseRow).filter(Boolean) as WhatsAppKycCase[];
}

export async function createCase(input: StaffInitiationPayload) {
  const nextCase = createWhatsAppCase(input);
  return persistCase(nextCase);
}

export async function persistBulkBatch(result: BulkCampaignResult, rows: BulkCampaignRow[]) {
  if (!hasSupabaseConfig()) {
    getMemoryStore().bulkBatches.set(result.batchId, result);
    return result;
  }

  await supabaseRequest("kyc_bulk_batches?on_conflict=id", {
    method: "POST",
    body: JSON.stringify([
      {
        id: result.batchId,
        batch_reference: result.batchReference,
        provider: result.provider,
        source: result.source,
        source_file_name: result.sourceFileName,
        status: result.status,
        received_at: result.receivedAt,
        row_count: result.rowCount,
        valid_count: result.validCount,
        error_count: result.errorCount,
        provider_report_csv: result.providerReport,
        metadata: {
          errors: result.errors,
          caseReferences: result.cases.map((kycCase) => kycCase.reference),
        },
      },
    ]),
  });

  if (rows.length > 0) {
    await supabaseRequest("kyc_bulk_rows?on_conflict=batch_id,row_number", {
      method: "POST",
      body: JSON.stringify(
        rows.map((row) => {
          const kycCase = result.cases.find((candidate) => candidate.staffInitiation.bulkCampaign?.rowNumber === row.rowNumber);
          return {
            id: `bulk_row_${result.batchId}_${row.rowNumber}`,
            batch_id: result.batchId,
            row_number: row.rowNumber,
            full_name: row.fullName,
            id_number: row.idNumber,
            phone_number: row.phoneNumber,
            campaign_id: row.campaignId ?? null,
            segment: row.segment ?? null,
            provider_reference: row.providerReference ?? null,
            tower_id: row.towerId ?? null,
            location_evidence: row.locationEvidence ?? null,
            case_id: kycCase?.id ?? null,
            status: kycCase ? "created" : "failed",
            error_message: null,
          };
        })
      ),
    });
  }

  return result;
}

export async function getCase(caseId: string) {
  return loadCase(caseId);
}

export async function saveCaseSnapshot(kycCase: WhatsAppKycCase) {
  return persistCase(kycCase);
}

export async function updateFromWebhook(payload: WhatsAppWebhookPayload) {
  const current = await loadCase(payload.caseId);
  if (!current) return null;
  const nextCase = applyWebhookEvent(current, payload);
  return persistCase(nextCase);
}

export async function createCaseSession(caseId: string) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const session = createSecureSession(current);
  const nextCase = {
    ...current,
    secureSessionToken: session.token,
    secureSessionExpiresAt: session.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  await persistCase(nextCase);
  return session;
}

export async function getCaseBySessionToken(sessionToken: string) {
  return loadCaseBySession(sessionToken);
}

export async function getCaseSummary(caseId: string) {
  const kycCase = await loadCase(caseId);
  if (!kycCase) return null;
  return summarizeCaseForReview(kycCase);
}

export async function getCaseAuditExport(caseId: string, format: "json" | "csv" = "json") {
  const kycCase = await loadCase(caseId);
  if (!kycCase) return null;
  return exportAuditTrail(kycCase, format);
}

export async function captureDeviceIntelligence(caseId: string, payload: DeviceIntelligence) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const nextCase = {
    ...current,
    deviceIntelligence: payload,
    updatedAt: new Date().toISOString(),
  };
  return persistCase(nextCase);
}

export async function updateCaseStatus(caseId: string, status: WhatsAppKycCase["status"]) {
  const current = await loadCase(caseId);
  if (!current) return null;
  if (!canTransitionCase(current.status, status)) {
    throw new Error(`Invalid case transition from '${current.status}' to '${status}'.`);
  }
  const nextCase = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
    auditTrail: [
      ...current.auditTrail,
      {
        id: `audit_manual_${Date.now()}`,
        caseId,
        timestamp: new Date().toISOString(),
        actorRole: "reviewer" as const,
        actorId: "review-console",
        action: "manual_status_override",
        details: { status },
      },
    ],
  };
  return persistCase(nextCase);
}

export async function captureLocation(caseId: string, payload: GeoCapture) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const hasAddressEvidence = Boolean(current.verification.proofOfAddressProvided || current.verification.digitalAffidavitProvided);
  const nextCase = {
    ...current,
    status: current.status === "location_pending" || (current.status === "address_pending" && hasAddressEvidence) ? "risk_review" : current.status,
    geoCapture: payload,
    residenceEvidence: {
      ...current.residenceEvidence,
      source: "customer_capture" as const,
      gpsCoordinates: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
      },
      what3wordsId: payload.what3words,
      towerId: payload.towerId ?? current.residenceEvidence?.towerId,
      capturedAt: payload.capturedAt,
    },
    verification: {
      ...current.verification,
      locationShared: true,
    },
    updatedAt: new Date().toISOString(),
  };
  return persistCase(nextCase);
}

export async function captureAffidavit(caseId: string, payload: AffidavitCapture) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const nextStatus =
    current.status === "address_pending"
      ? current.verification.locationShared
        ? "risk_review"
        : "location_pending"
      : current.status;
  const nextCase = {
    ...current,
    status: nextStatus,
    affidavit: payload,
    residenceEvidence: {
      ...current.residenceEvidence,
      source: current.residenceEvidence?.source ?? ("customer_capture" as const),
      affidavitVideoUrl: payload.videoUrl,
      capturedAt: payload.capturedAt,
    },
    verification: {
      ...current.verification,
      digitalAffidavitProvided: true,
    },
    documentUrls: {
      ...current.documentUrls,
      affidavitVideo: payload.videoUrl,
    },
    updatedAt: new Date().toISOString(),
  };
  return persistCase(
    appendAudit(nextCase, {
      actorRole: "system",
      actorId: "affidavit-ai-reader",
      action: "proof_verified",
      details: {
        proofType: "digital_affidavit",
        aiValidationScore: payload.aiValidationScore,
        aiExtractedAddress: payload.aiExtractedAddress,
        reviewReason: payload.aiReviewReason,
        crossVerifiedAgainstDocument: Boolean(current.documentUrls.proofOfAddress),
      },
    })
  );
}

export async function captureIdDocument(caseId: string, payload: { documentUrl: string; documentType: string; ocrConfidence?: number }) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const nextCase = {
    ...current,
    verification: {
      ...current.verification,
      identityDocument: {
        documentType: payload.documentType,
        ocrConfidence: payload.ocrConfidence ?? 0.9,
      },
    },
    documentUrls: {
      ...current.documentUrls,
      idDocument: payload.documentUrl,
    },
    updatedAt: new Date().toISOString(),
  };
  return persistCase(
    appendAudit(nextCase, {
      actorRole: "system",
      actorId: "ocr-provider",
      action: "document_uploaded",
      details: {
        documentType: payload.documentType,
        ocrConfidence: nextCase.verification.identityDocument.ocrConfidence,
        extractedFieldsStored: true,
      },
    })
  );
}

export async function captureProofOfAddress(caseId: string, payload: { proofOfAddressUrl: string; fileName?: string; documentType?: string }) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const documentType = payload.documentType ?? inferProofOfAddressDocumentType(payload.fileName ?? payload.proofOfAddressUrl);
  const nextStatus =
    current.status === "address_pending"
      ? current.verification.locationShared
        ? "risk_review"
        : "location_pending"
      : current.status;
  const nextCase = {
    ...current,
    status: nextStatus,
    verification: {
      ...current.verification,
      proofOfAddressProvided: true,
      proofOfAddressDocument: {
        documentType,
        fileName: payload.fileName,
        accepted: isAcceptedProofOfAddressDocument(documentType),
        simulatedOcrScore: simulateAddressOcrScore(documentType),
      },
    },
    documentUrls: {
      ...current.documentUrls,
      proofOfAddress: payload.proofOfAddressUrl,
    },
    updatedAt: new Date().toISOString(),
  };
  return persistCase(
    appendAudit(nextCase, {
      actorRole: "system",
      actorId: "address-ocr-provider",
      action: "proof_verified",
      details: {
        documentType,
        fileName: payload.fileName,
        accepted: nextCase.verification.proofOfAddressDocument.accepted,
        simulatedOcrScore: nextCase.verification.proofOfAddressDocument.simulatedOcrScore,
      },
    })
  );
}

function inferProofOfAddressDocumentType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("bank")) return "Bank statement";
  if (normalized.includes("eskom") || normalized.includes("electric")) return "Eskom or municipal electricity account";
  if (normalized.includes("water") || normalized.includes("rates") || normalized.includes("municipal")) return "Water and rates account";
  if (normalized.includes("telkom") || normalized.includes("internet") || normalized.includes("isp")) return "Telkom or internet service provider invoice";
  if (normalized.includes("utility")) return "Utility bill";
  return "Proof of address document";
}

function isAcceptedProofOfAddressDocument(documentType: string) {
  return [
    "Bank statement",
    "Eskom or municipal electricity account",
    "Water and rates account",
    "Telkom or internet service provider invoice",
    "Utility bill",
  ].includes(documentType);
}

function simulateAddressOcrScore(documentType: string) {
  if (documentType === "Proof of address document") return 0.74;
  if (documentType === "Bank statement") return 0.91;
  if (documentType === "Utility bill") return 0.88;
  return 0.86;
}

export async function upsertOtp(caseId: string, mode: "send" | "verify", attempts = 1) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const now = new Date();
  const hasAddressEvidence = Boolean(current.verification.proofOfAddressProvided || current.verification.digitalAffidavitProvided);
  const nextStatus =
    mode === "verify"
      ? "otp_approved"
      : current.status === "consent_pending"
        ? "otp_pending"
        : current.status;
  const nextCase = {
    ...current,
    status: nextStatus,
    applicant: {
      ...current.applicant,
      consentGiven: mode === "verify" ? true : current.applicant.consentGiven,
    },
    consentCapturedAt: mode === "verify" ? now.toISOString() : current.consentCapturedAt,
    verification: {
      ...current.verification,
      otp:
        mode === "verify"
          ? {
              status: "verified" as const,
              attempts,
              expiresAt: current.verification.otp?.expiresAt ?? new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
              lastSentAt: current.verification.otp?.lastSentAt ?? now.toISOString(),
              verifiedAt: now.toISOString(),
            }
          : {
              status: "pending" as const,
              attempts,
              expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
              lastSentAt: now.toISOString(),
            },
    },
    updatedAt: now.toISOString(),
  };
  return persistCase(
    appendAudit(nextCase, {
      actorRole: "system",
      actorId: "otp-provider",
      action: mode === "verify" ? "otp_verified" : "otp_sent",
      details: {
        attempts,
        msisdnVerified: mode === "verify",
        phoneNumber: nextCase.applicant.phoneNumber ?? nextCase.staffInitiation.customerPhoneNumber,
      },
    })
  );
}

export async function runRiskAssessment(caseId: string) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const risk = calculateRiskAssessment(current);
  const nextCase = {
    ...current,
    risk,
    status: risk.status,
    updatedAt: new Date().toISOString(),
  };
  return persistCase(
    appendAudit(nextCase, {
      actorRole: "system",
      actorId: "risk-engine",
      action: "final_verification_complete",
      details: {
        decision: risk.decision,
        score: risk.score,
        band: risk.band,
        reasonCodes: risk.reasonCodes,
      },
    })
  );
}

export function getPersistenceMode() {
  return hasSupabaseConfig() ? "supabase" : "memory";
}
