import {
  applyWebhookEvent,
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

type StoreShape = {
  cases: Map<string, WhatsAppKycCase>;
  sessions: Map<string, { caseId: string; expiresAt: string }>;
};

const globalStore = globalThis as typeof globalThis & { __whatsappKycStore?: StoreShape };

function getMemoryStore() {
  if (!globalStore.__whatsappKycStore) {
    globalStore.__whatsappKycStore = {
      cases: new Map<string, WhatsAppKycCase>(),
      sessions: new Map<string, { caseId: string; expiresAt: string }>(),
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
        updated_at: kycCase.updatedAt,
        case_payload: kycCase,
      },
    ]),
  });

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

export async function getCase(caseId: string) {
  return loadCase(caseId);
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
  return persistCase(nextCase);
}

export async function captureIdDocument(caseId: string, payload: { documentUrl: string; documentType: string; ocrConfidence?: number }) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const nextCase = {
    ...current,
    documentUrls: {
      ...current.documentUrls,
      idDocument: payload.documentUrl,
    },
    updatedAt: new Date().toISOString(),
  };
  return persistCase(nextCase);
}

export async function captureProofOfAddress(caseId: string, payload: { proofOfAddressUrl: string; fileName?: string }) {
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
    verification: {
      ...current.verification,
      proofOfAddressProvided: true,
    },
    documentUrls: {
      ...current.documentUrls,
      proofOfAddress: payload.proofOfAddressUrl,
    },
    updatedAt: new Date().toISOString(),
  };
  return persistCase(nextCase);
}

export async function upsertOtp(caseId: string, mode: "send" | "verify", attempts = 1) {
  const current = await loadCase(caseId);
  if (!current) return null;
  const now = new Date();
  const hasAddressEvidence = Boolean(current.verification.proofOfAddressProvided || current.verification.digitalAffidavitProvided);
  const nextStatus =
    mode === "verify"
      ? hasAddressEvidence
        ? current.verification.locationShared
          ? "risk_review"
          : "location_pending"
        : "address_pending"
      : current.status;
  const nextCase = {
    ...current,
    status: nextStatus,
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
  return persistCase(nextCase);
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
  return persistCase(nextCase);
}

export function getPersistenceMode() {
  return hasSupabaseConfig() ? "supabase" : "memory";
}
