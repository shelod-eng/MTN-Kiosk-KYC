import { createReference, type Decision, type RiskBand } from "@/lib/mock-data";
import { validateSouthAfricanIdNumber } from "@/lib/sa-id";

export type WhatsAppCaseStatus =
  | "initiated"
  | "consent_pending"
  | "otp_approved"
  | "details_pending"
  | "selfie_pending"
  | "otp_pending"
  | "address_pending"
  | "location_pending"
  | "risk_review"
  | "manual_review"
  | "approved"
  | "rejected"
  | "verified";

export type AuditActorRole = "staff" | "customer" | "system" | "reviewer";

export type TrustLayerResult = {
  key:
    | "name"
    | "id_number"
    | "id_document"
    | "otp"
    | "liveness"
    | "face_match"
    | "proof_of_address"
    | "digital_affidavit"
    | "location"
    | "tower_location"
    | "device"
    | "timestamp";
  label: string;
  score: number;
  weight: number;
  status: "pass" | "review" | "fail" | "missing";
  reason: string;
};

export type StaffInitiationPayload = {
  staffId: string;
  staffName: string;
  staffRole: string;
  tenant: "MTN" | "Vodacom" | "Cell C";
  customerPhoneNumber: string;
  deliveryMethod: "whatsapp" | "qr";
  notes?: string;
  applicant?: Partial<WhatsAppApplicant>;
  bulkCampaign?: {
    batchId: string;
    batchReference: string;
    rowNumber: number;
    source: "upload" | "paste" | "sftp";
    sourceFileName: string;
    campaignId?: string;
    segment?: string;
    providerReference?: string;
    towerId?: string;
    locationEvidence?: string;
  };
};

export type WhatsAppApplicant = {
  fullName: string;
  idNumber: string;
  phoneNumber: string;
  consentGiven: boolean;
};

export type DeviceIntelligence = {
  browserFingerprint?: string;
  ipAddress?: string;
  operatingSystem?: string;
  browser?: string;
  screenSize?: string;
  timezone?: string;
  language?: string;
  touchCapable?: boolean;
  sessionContinuity?: boolean;
  cookiesEnabled?: boolean;
};

export type GeoCapture = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  what3words?: string;
  towerId?: string;
  capturedAt: string;
};

export type AffidavitCapture = {
  name: string;
  address: string;
  declarationAccepted: boolean;
  responses: Array<{ question: string; answer: string }>;
  affidavitText?: string;
  extractedIdNumber?: string;
  matchedIdNumber?: boolean;
  aiValidationScore?: number;
  aiExtractedAddress?: string;
  aiReviewReason?: string;
  videoUrl?: string;
  imageUrl?: string;
  capturedAt: string;
};

export type ResidenceEvidence = {
  source: "customer_capture" | "provider_batch";
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  what3wordsId?: string;
  towerId?: string;
  locationEvidence?: string;
  affidavitVideoUrl?: string;
  affidavitImageUrl?: string;
  capturedAt: string;
};

export type OtpRecord = {
  status: "pending" | "verified" | "expired" | "locked";
  attempts: number;
  expiresAt: string;
  lastSentAt: string;
  verifiedAt?: string;
  codeHash?: string;
  provider?: string;
  providerReference?: string;
  channel?: "whatsapp";
};

export type RiskAssessment = {
  score: number;
  band: RiskBand;
  decision: Decision;
  status: Extract<WhatsAppCaseStatus, "approved" | "manual_review" | "rejected">;
  reasonCodes: string[];
  layers: TrustLayerResult[];
};

export type HomeAffairsVerification = {
  provider: "mock-dha-ready" | "verify-now" | "dha-direct";
  mode: "simulation" | "live";
  status: "verified" | "review" | "blocked" | "deceased" | "unavailable";
  matched: boolean;
  idStatus: "valid" | "invalid" | "blocked";
  names?: string;
  surname?: string;
  dateOfBirth?: string;
  gender?: string;
  citizenship?: string;
  deceased?: boolean;
  smartId?: boolean;
  photoAvailable?: boolean;
  checkedAt: string;
  reference: string;
  complianceNote: string;
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actorRole: AuditActorRole;
  actorId: string;
  action: string;
  caseId: string;
  details: Record<string, unknown>;
  immutableHash?: string;
};

export type WhatsAppKycCase = {
  id: string;
  reference: string;
  tenant: StaffInitiationPayload["tenant"];
  channel: "WhatsApp";
  status: WhatsAppCaseStatus;
  applicant: Partial<WhatsAppApplicant>;
  staffInitiation: StaffInitiationPayload;
  consentCapturedAt?: string;
  secureSessionToken?: string;
  secureSessionExpiresAt?: string;
  deviceIntelligence?: DeviceIntelligence;
  geoCapture?: GeoCapture;
  affidavit?: AffidavitCapture;
  residenceEvidence?: ResidenceEvidence;
  documentUrls: {
    idDocument?: string;
    selfie?: string;
    proofOfAddress?: string;
    affidavitVideo?: string;
    affidavitImage?: string;
  };
  verification: {
    idValidation?: ReturnType<typeof validateSouthAfricanIdNumber>;
    identityDocument?: {
      documentType: string;
      ocrConfidence: number;
      fileName?: string;
      extractedIdNumber?: string;
      extractedFullName?: string;
      matchedEnteredId?: boolean; // match at upload time
      matchedEnteredIdFinal?: boolean; // final match after biometrics
      homeAffairsVerification?: HomeAffairsVerification;
    };
    livenessScore?: number;
    faceMatchScore?: number;
    otp?: OtpRecord;
    proofOfAddressDocument?: {
      documentType: string;
      fileName?: string;
      accepted: boolean;
      simulatedOcrScore: number;
      documentDate?: string;
      isExpired?: boolean;
      isFutureDated?: boolean;
      reviewReason?: string;
    };
    proofOfAddressProvided?: boolean;
    digitalAffidavitProvided?: boolean;
    locationShared?: boolean;
  };
  risk?: RiskAssessment;
  auditTrail: AuditLogEntry[];
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppWebhookPayload = {
  caseId: string;
  event:
    | "consent_received"
    | "details_submitted"
    | "selfie_captured"
    | "otp_sent"
    | "otp_verified"
    | "address_submitted"
    | "affidavit_submitted"
    | "location_shared"
    | "risk_requested";
  actorId?: string;
  details?: Partial<WhatsAppApplicant> & Record<string, unknown>;
};

const validTransitions: Partial<Record<WhatsAppCaseStatus, WhatsAppCaseStatus[]>> = {
  initiated: ["consent_pending"],
  consent_pending: ["otp_pending", "details_pending"],
  otp_pending: ["otp_approved", "address_pending"],
  otp_approved: ["details_pending", "selfie_pending"],
  details_pending: ["selfie_pending"],
  selfie_pending: ["otp_pending", "address_pending", "location_pending", "risk_review"],
  address_pending: ["location_pending", "risk_review"],
  location_pending: ["risk_review"],
  risk_review: ["approved", "manual_review", "rejected"],
  manual_review: ["approved", "rejected", "verified"],
  approved: ["verified"],
};

export function canTransitionCase(from: WhatsAppCaseStatus, to: WhatsAppCaseStatus) {
  if (from === to) return true;
  const allowed = validTransitions[from] ?? [];
  return allowed.includes(to);
}

export function createWhatsAppCase(input: StaffInitiationPayload): WhatsAppKycCase {
  const now = new Date().toISOString();
  const id = `WA-CASE-${cryptoRandomToken(8).toUpperCase()}`;
  const reference = createReference("WA");
  const providerResidenceEvidence =
    input.bulkCampaign?.towerId || input.bulkCampaign?.locationEvidence
      ? buildProviderResidenceEvidence(input.bulkCampaign.towerId, input.bulkCampaign.locationEvidence, now)
      : undefined;

  const initialCase: WhatsAppKycCase = {
    id,
    reference,
    tenant: input.tenant,
    channel: "WhatsApp",
    status: "consent_pending",
    applicant: {
      fullName: input.applicant?.fullName,
      idNumber: input.applicant?.idNumber,
      phoneNumber: normalizePhoneNumber(input.customerPhoneNumber),
    },
    staffInitiation: input,
    residenceEvidence: providerResidenceEvidence,
    documentUrls: {},
    verification: {
      locationShared: Boolean(providerResidenceEvidence?.gpsCoordinates),
    },
    auditTrail: [],
    createdAt: now,
    updatedAt: now,
  };

  return appendAudit(initialCase, {
    actorRole: "staff",
    actorId: input.staffId,
    action: "staff_initiated_case",
    details: {
      tenant: input.tenant,
      deliveryMethod: input.deliveryMethod,
      customerPhoneNumber: normalizePhoneNumber(input.customerPhoneNumber),
      staffRole: input.staffRole,
      bulkCampaign: input.bulkCampaign,
      residenceEvidence: providerResidenceEvidence,
    },
  });
}

export function applyWebhookEvent(kycCase: WhatsAppKycCase, payload: WhatsAppWebhookPayload) {
  const nextCase = { ...kycCase, applicant: { ...kycCase.applicant }, verification: { ...kycCase.verification } };
  const previousStatus = kycCase.status;
  const systemAuditEvents: Array<Omit<AuditLogEntry, "id" | "timestamp" | "caseId">> = [];

  if (payload.event === "consent_received") {
    nextCase.applicant.consentGiven = true;
    nextCase.consentCapturedAt = new Date().toISOString();
    nextCase.status = "details_pending";
  }

  if (payload.event === "details_submitted") {
    nextCase.applicant.fullName = String(payload.details?.fullName ?? nextCase.applicant.fullName ?? "");
    nextCase.applicant.idNumber = String(payload.details?.idNumber ?? nextCase.applicant.idNumber ?? "");
    nextCase.applicant.phoneNumber = normalizePhoneNumber(
      String(payload.details?.phoneNumber ?? nextCase.applicant.phoneNumber ?? "")
    );
    nextCase.verification.idValidation = validateSouthAfricanIdNumber(nextCase.applicant.idNumber ?? "");
    systemAuditEvents.push({
      actorRole: "system",
      actorId: "sa-id-validator",
      action: nextCase.verification.idValidation.isValid ? "id_checksum_passed" : "id_checksum_failed",
      details: {
        normalizedIdNumber: nextCase.verification.idValidation.normalized,
        errors: nextCase.verification.idValidation.errors,
        dhaValidation: "mock_ready_for_production_integration",
      },
    });
    nextCase.status = "selfie_pending";
  }

  if (payload.event === "selfie_captured") {
    nextCase.verification.livenessScore = Number(payload.details?.livenessScore ?? nextCase.verification.livenessScore ?? 0);
    nextCase.verification.faceMatchScore = Number(payload.details?.faceMatchScore ?? nextCase.verification.faceMatchScore ?? 0);
    nextCase.documentUrls.selfie = String(payload.details?.selfieUrl ?? nextCase.documentUrls.selfie ?? "");
    const hasAddressEvidence = Boolean(nextCase.verification.proofOfAddressProvided || nextCase.verification.digitalAffidavitProvided);
    nextCase.status =
      nextCase.verification.otp?.status !== "verified"
        ? "otp_pending"
        : hasAddressEvidence
          ? nextCase.verification.locationShared
            ? "risk_review"
            : "location_pending"
          : "address_pending";
    systemAuditEvents.push({
      actorRole: "system",
      actorId: "biometric-provider",
      action: "selfie_verified",
      details: {
        livenessScore: nextCase.verification.livenessScore,
        faceMatchScore: nextCase.verification.faceMatchScore,
        comparedAgainstIdDocument: Boolean(nextCase.documentUrls.idDocument),
        extractedIdNumber: nextCase.verification.identityDocument?.extractedIdNumber ?? null,
        matchedEnteredIdFinal: nextCase.verification.identityDocument?.extractedIdNumber
          ? String(nextCase.verification.identityDocument?.extractedIdNumber) === String(nextCase.applicant.idNumber ?? "")
          : nextCase.verification.identityDocument?.matchedEnteredId ?? false,
      },
    });

    // persist final matched flag into verification.identityDocument
    if (nextCase.verification.identityDocument?.extractedIdNumber) {
      nextCase.verification.identityDocument.matchedEnteredIdFinal =
        String(nextCase.verification.identityDocument.extractedIdNumber) === String(nextCase.applicant.idNumber ?? "");
    }
  }

  if (payload.event === "otp_sent") {
    const now = new Date();
    nextCase.verification.otp = {
      status: "pending",
      attempts: Number(payload.details?.attempts ?? 0),
      lastSentAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    };
  }

  if (payload.event === "otp_verified") {
    nextCase.verification.otp = {
      status: "verified",
      attempts: Number(payload.details?.attempts ?? nextCase.verification.otp?.attempts ?? 1),
      lastSentAt: nextCase.verification.otp?.lastSentAt ?? new Date().toISOString(),
      expiresAt: nextCase.verification.otp?.expiresAt ?? new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    };
    nextCase.status = "address_pending";
  }

  if (payload.event === "address_submitted") {
    nextCase.verification.proofOfAddressProvided = true;
    nextCase.documentUrls.proofOfAddress = String(
      payload.details?.proofOfAddressUrl ?? nextCase.documentUrls.proofOfAddress ?? ""
    );
    nextCase.status = "location_pending";
  }

  if (payload.event === "affidavit_submitted") {
    nextCase.verification.digitalAffidavitProvided = true;
    nextCase.documentUrls.affidavitVideo = String(
      payload.details?.videoUrl ?? nextCase.documentUrls.affidavitVideo ?? ""
    );
    nextCase.status = "location_pending";
  }

  if (payload.event === "location_shared") {
    nextCase.verification.locationShared = true;
    nextCase.status = "risk_review";
  }

  if (payload.event === "risk_requested") {
    nextCase.risk = calculateRiskAssessment(nextCase);
    nextCase.status = nextCase.risk.status;
  }

  nextCase.updatedAt = new Date().toISOString();
  assertValidTransition(previousStatus, nextCase.status);

  const auditedCase = appendAudit(nextCase, {
    actorRole: "customer",
    actorId: payload.actorId ?? "whatsapp-user",
    action: payload.event,
    details: payload.details ?? {},
  });
  return systemAuditEvents.reduce((current, entry) => appendAudit(current, entry), auditedCase);
}

function isValidIpForRisk(ip: string | undefined): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  // Reject localhost, IPv6 loopback, private ranges, and demo values
  if (/^(127|::1|0\.0\.0\.0|localhost|unknown|demo-local-ip|,|:)/.test(trimmed)) return false;
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(trimmed)) return false;
  // Valid IPv4: 4 octets separated by dots
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return true;
  // Valid IPv6: contains at least 2 colons and is not loopback
  if (trimmed.includes(":") && !trimmed.startsWith("::")) return true;
  return false;
}

export function calculateRiskAssessment(kycCase: WhatsAppKycCase): RiskAssessment {
  const idValidation = kycCase.verification.idValidation ?? validateSouthAfricanIdNumber(kycCase.applicant.idNumber ?? "");
  const hasFullName = Boolean(kycCase.applicant.fullName?.trim());
  const otpVerified = kycCase.verification.otp?.status === "verified";
  const livenessScore = kycCase.verification.livenessScore ?? 0;
  const faceMatchScore = kycCase.verification.faceMatchScore ?? 0;
  const idDocument = kycCase.verification.identityDocument;
  const idDocumentCaptured = Boolean(kycCase.documentUrls.idDocument && idDocument);
  const idDocumentMatched =
    idDocument?.matchedEnteredIdFinal ?? idDocument?.matchedEnteredId ?? (idDocument?.extractedIdNumber ? false : undefined);
  const idDocumentMismatch = idDocumentMatched === false;
  const homeAffairsVerification = idDocument?.homeAffairsVerification;
  const homeAffairsMatched = homeAffairsVerification?.matched === true;
  const homeAffairsNeedsReview = Boolean(homeAffairsVerification && !homeAffairsVerification.matched);
  
  // Check proof document acceptance and consistency
  const proofDocAccepted = kycCase.verification.proofOfAddressDocument?.accepted ?? false;
  const proofNeedsReview = Boolean(kycCase.verification.proofOfAddressDocument?.reviewReason);
  const proofDocumentQuality = kycCase.verification.proofOfAddressDocument?.simulatedOcrScore ?? (kycCase.verification.digitalAffidavitProvided ? kycCase.affidavit?.aiValidationScore : 0);
  const proofSupported = Boolean((kycCase.verification.proofOfAddressProvided && proofDocAccepted && (proofDocumentQuality ?? 0) >= 0.72) || kycCase.verification.digitalAffidavitProvided);
  const hasAddressEvidence = Boolean(kycCase.verification.proofOfAddressProvided || kycCase.verification.digitalAffidavitProvided);
  const proofRejected = Boolean(kycCase.verification.proofOfAddressProvided && !proofDocAccepted && !proofNeedsReview && !kycCase.verification.digitalAffidavitProvided);
  const affidavitIdMismatch = kycCase.affidavit?.matchedIdNumber === false;
  
  const towerId = kycCase.residenceEvidence?.towerId ?? kycCase.staffInitiation.bulkCampaign?.towerId;
  const locationEvidence = kycCase.residenceEvidence?.locationEvidence ?? kycCase.staffInitiation.bulkCampaign?.locationEvidence;
  const hasProviderGps = Boolean(kycCase.residenceEvidence?.gpsCoordinates);
  const towerLocationAvailable = Boolean(towerId);
  const locationShared = Boolean(kycCase.verification.locationShared || kycCase.geoCapture || hasProviderGps);
  const affidavitAndLocation = Boolean(kycCase.verification.digitalAffidavitProvided && (locationShared || towerLocationAvailable));
  const hasIpAddress = Boolean(kycCase.deviceIntelligence?.ipAddress?.trim());
  const hasDeviceFingerprint = Boolean(kycCase.deviceIntelligence?.browserFingerprint?.trim());
  const deviceLinked = Boolean(hasDeviceFingerprint && hasIpAddress && isValidIpForRisk(kycCase.deviceIntelligence?.ipAddress));
  const deviceCaptured = Boolean(hasDeviceFingerprint && hasIpAddress);
  const missingLocationEvidence = !locationShared && !towerLocationAvailable;
  const auditActions = new Set(kycCase.auditTrail.map((entry) => entry.action));
  const missingRequiredAuditEvents = [
    idDocumentCaptured && !auditActions.has("document_uploaded") ? "document_uploaded" : null,
    hasAddressEvidence && !auditActions.has("proof_verified") ? "proof_verified" : null,
    kycCase.documentUrls.selfie && !auditActions.has("selfie_verified") ? "selfie_verified" : null,
  ].filter((action): action is string => Boolean(action));

  const layers: TrustLayerResult[] = [
    weightedLayer("name", "Full name captured", hasFullName ? 100 : 0, 0.08, hasFullName ? "pass" : "missing", hasFullName ? "Customer full name captured." : "Full name is still missing."),
    weightedLayer("id_number", "SA ID validation", idValidation.isValid ? 100 : 20, 0.16, idValidation.isValid ? "pass" : "fail", idValidation.isValid ? "ID format and checksum passed." : idValidation.errors.join(" ")),
    weightedLayer(
      "id_document",
      "Uploaded ID + Home Affairs match",
      idDocumentCaptured ? (idDocumentMismatch ? 15 : homeAffairsMatched ? 100 : idDocumentMatched ? 90 : homeAffairsNeedsReview ? 65 : 70) : 0,
      0.1,
      !idDocumentCaptured ? "missing" : idDocumentMismatch ? "fail" : homeAffairsMatched || idDocumentMatched ? "pass" : "review",
      !idDocumentCaptured
        ? "ID, driver's licence, or passport upload is still required."
        : idDocumentMismatch
          ? `Uploaded document ID ${idDocument?.extractedIdNumber ?? "unknown"} does not match entered applicant ID.`
          : homeAffairsMatched
            ? `Home Affairs identity report matched via ${homeAffairsVerification.provider} (${homeAffairsVerification.mode}).`
            : idDocumentMatched
              ? "Uploaded document ID matches the entered applicant ID; Home Affairs provider can be activated when credentials are ready."
              : "Uploaded document ID could not be fully matched by the prototype OCR or DHA-ready check."
    ),
    weightedLayer("otp", "OTP verification", otpVerified ? 100 : 25, 0.12, otpVerified ? "pass" : "review", otpVerified ? "OTP verified successfully." : "OTP verification is incomplete."),
    weightedLayer("liveness", "Liveness detection", Math.round(livenessScore * 100), 0.16, livenessScore >= 0.8 ? "pass" : livenessScore >= 0.65 ? "review" : "fail", `Liveness score ${livenessScore.toFixed(2)}.`),
    weightedLayer("face_match", "Face match", Math.round(faceMatchScore * 100), 0.14, faceMatchScore >= 0.82 ? "pass" : faceMatchScore >= 0.7 ? "review" : "fail", `Face match score ${faceMatchScore.toFixed(2)}.`),
    weightedLayer(
      "proof_of_address",
      "Proof of address or affidavit",
      Math.round((proofDocumentQuality ?? 0) * 100),
      0.12,
      proofSupported && (proofDocumentQuality ?? 0) >= 0.72 ? "pass" : hasAddressEvidence ? "review" : "fail",
      proofSupported
        ? `Address evidence accepted with ${Math.round((proofDocumentQuality ?? 0) * 100)}% quality.`
        : proofNeedsReview
          ? kycCase.verification.proofOfAddressDocument?.reviewReason ?? "Proof of address needs RICA manual review."
          : proofRejected
            ? "Proof of address document was captured but needs manual compliance review."
            : "Proof of address or affidavit is still required."
    ),
    weightedLayer("location", "GPS location and timestamp", locationShared ? 100 : towerLocationAvailable ? 70 : 40, 0.09, locationShared ? "pass" : towerLocationAvailable ? "review" : "missing", locationShared ? "GPS location captured." : towerLocationAvailable ? "Provider tower location is available, but customer GPS is still preferred." : "Location has not been shared."),
    weightedLayer(
      "tower_location",
      "Provider tower residence zone",
      towerLocationAvailable ? 82 : locationShared ? 100 : 45,
      0.03,
      towerLocationAvailable ? "review" : locationShared ? "pass" : "missing",
      towerLocationAvailable
        ? `Provider supplied tower ${towerId}${locationEvidence ? ` with ${locationEvidence}` : ""}.`
        : locationShared
          ? "Customer GPS is the primary residence signal."
          : "No provider tower residence zone supplied."
    ),
    weightedLayer(
      "device",
      "Device intelligence",
      deviceLinked ? 100 : deviceCaptured ? 70 : 0,
      0.1,
      deviceLinked ? "pass" : deviceCaptured ? "review" : "missing",
      deviceLinked
        ? "Device intelligence linked to secure session."
        : deviceCaptured
          ? "Device/IP captured; local or private IP requires production network verification."
          : "Device fingerprint or IP address has not been captured."
    ),
  ];

  const baseScore = Math.min(100, Math.round(layers.reduce((sum, layer) => sum + layer.score * layer.weight, 0)));
  const reasonCodes = layers.filter((layer) => layer.status !== "pass").map((layer) => layer.key.toUpperCase());
  if (idDocumentMismatch) reasonCodes.push("ID_DOCUMENT_MISMATCH");
  if (homeAffairsNeedsReview) reasonCodes.push("HOME_AFFAIRS_REVIEW");
  if (affidavitIdMismatch) reasonCodes.push("AFFIDAVIT_ID_MISMATCH");
  if (!idDocumentCaptured) reasonCodes.push("ID_DOCUMENT_MISSING");
  if (!hasAddressEvidence) reasonCodes.push("ADDRESS_EVIDENCE_MISSING");
  if (proofNeedsReview) reasonCodes.push("PROOF_ADDRESS_REVIEW_REQUIRED");
  if (proofRejected) reasonCodes.push("PROOF_ADDRESS_REVIEW_REQUIRED");
  if (!hasIpAddress) reasonCodes.push("IP_ADDRESS_MISSING");
  if (missingLocationEvidence) reasonCodes.push("GPS_OR_TOWER_MISSING");
  if (missingRequiredAuditEvents.length > 0) reasonCodes.push("AUDIT_EVENTS_MISSING");

  let band: RiskBand = "low";
  let decision: Decision = "APPROVE";
  let status: RiskAssessment["status"] = "approved";
  let score = baseScore;

  const anyFail = layers.some((layer) => layer.status === "fail");
  const anyReview = layers.some((layer) => layer.status === "review" || layer.status === "missing");
  const hardFailure = Boolean(
    !idValidation.isValid ||
      !idDocumentCaptured ||
      idDocumentMismatch ||
      affidavitIdMismatch ||
      !hasAddressEvidence ||
      (!hasIpAddress && missingLocationEvidence)
  );
  const complianceReview = Boolean(
    proofRejected ||
      proofNeedsReview ||
      !deviceCaptured ||
      missingLocationEvidence ||
      missingRequiredAuditEvents.length > 0 ||
      (kycCase.verification.digitalAffidavitProvided && !kycCase.verification.proofOfAddressProvided)
  );

  if (hardFailure) {
    band = "high";
    decision = "REJECT";
    status = "rejected";
    score = Math.min(score, 49);
  } else if (affidavitAndLocation && !anyFail && score >= 78 && !complianceReview) {
    band = "low";
    decision = "APPROVE";
    status = "approved";
  } else if (score < 55 || anyFail) {
    band = "high";
    decision = "REJECT";
    status = "rejected";
  } else if (score < 80 || anyReview || complianceReview) {
    band = "medium";
    decision = "REVIEW";
    status = "manual_review";
    score = complianceReview ? Math.min(score, 74) : score;
  }

  return {
    score,
    band,
    decision,
    status,
    reasonCodes,
    layers,
  };
}

export function createSecureSession(kycCase: WhatsAppKycCase) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 15 * 60 * 1000);
  const payload = {
    caseId: kycCase.id,
    reference: kycCase.reference,
    exp: expiresAt.toISOString(),
    iat: issuedAt.toISOString(),
    steps: ["selfie", "device-intelligence", "location", "affidavit"],
  };

  return {
    token: signSessionPayload(payload),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    caseId: kycCase.id,
    nextSteps: payload.steps,
  };
}

export function validateSecureSessionToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = hashValue(`${encodedPayload}.${getSessionSecret()}`);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      caseId: string;
      reference: string;
      exp: string;
      iat: string;
      steps: string[];
    };

    if (new Date(payload.exp).getTime() < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function maskPhoneNumber(value?: string) {
  if (!value) return "Not captured";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;
  return `${value.slice(0, 4)}••••${digits.slice(-3)}`;
}

export function maskIdNumber(value?: string) {
  if (!value) return "Not captured";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 13) return value;
  return `${digits.slice(0, 6)}•••••${digits.slice(-2)}`;
}

export function summarizeCaseForReview(kycCase: WhatsAppKycCase) {
  return {
    id: kycCase.id,
    reference: kycCase.reference,
    tenant: kycCase.tenant,
    status: kycCase.status,
    applicant: {
      fullName: kycCase.applicant.fullName ?? "Pending",
      phoneNumber: maskPhoneNumber(kycCase.applicant.phoneNumber),
      idNumber: maskIdNumber(kycCase.applicant.idNumber),
    },
    evidence: {
      consentCapturedAt: kycCase.consentCapturedAt ?? null,
      deviceLinked: Boolean(kycCase.deviceIntelligence?.browserFingerprint),
      livenessScore: kycCase.verification.livenessScore ?? null,
      faceMatchScore: kycCase.verification.faceMatchScore ?? null,
      otpStatus: kycCase.verification.otp?.status ?? "pending",
      proofOfAddressProvided: Boolean(kycCase.verification.proofOfAddressProvided),
      digitalAffidavitProvided: Boolean(kycCase.verification.digitalAffidavitProvided),
      locationShared: Boolean(kycCase.verification.locationShared),
      what3words: kycCase.geoCapture?.what3words ?? null,
      gpsCoordinates: kycCase.residenceEvidence?.gpsCoordinates ?? null,
      towerId: kycCase.residenceEvidence?.towerId ?? kycCase.staffInitiation.bulkCampaign?.towerId ?? null,
      locationEvidence: kycCase.residenceEvidence?.locationEvidence ?? kycCase.staffInitiation.bulkCampaign?.locationEvidence ?? null,
      affidavitVideoUrl: kycCase.residenceEvidence?.affidavitVideoUrl ?? kycCase.documentUrls.affidavitVideo ?? null,
    },
    risk: kycCase.risk ?? null,
    missingItems: buildMissingItems(kycCase),
    auditCount: kycCase.auditTrail.length,
  };
}

export function exportAuditTrail(kycCase: WhatsAppKycCase, format: "json" | "csv" = "json") {
  const rows = kycCase.auditTrail.map((entry) => ({
    timestamp: entry.timestamp,
    action: entry.action,
    actorRole: entry.actorRole,
    actorId: entry.actorId,
    immutableHash: entry.immutableHash ?? "",
    details: JSON.stringify(entry.details),
  }));

  if (format === "csv") {
    const header = "timestamp,action,actorRole,actorId,immutableHash,details";
    const lines = rows.map((row) =>
      [row.timestamp, row.action, row.actorRole, row.actorId, row.immutableHash, row.details]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    );
    return [header, ...lines].join("\n");
  }

  return rows;
}

export function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.startsWith("0")) return `+27${digits.slice(1)}`;
  return digits ? `+${digits}` : "";
}

export function appendAudit(
  kycCase: WhatsAppKycCase,
  entry: Omit<AuditLogEntry, "id" | "timestamp" | "caseId">
) {
  const timestamp = new Date().toISOString();
  const auditEntry: AuditLogEntry = {
    id: `audit_${cryptoRandomToken(10)}`,
    timestamp,
    caseId: kycCase.id,
    ...entry,
  };
  auditEntry.immutableHash = hashValue(
    JSON.stringify({
      id: auditEntry.id,
      timestamp,
      caseId: auditEntry.caseId,
      actorRole: auditEntry.actorRole,
      actorId: auditEntry.actorId,
      action: auditEntry.action,
      details: auditEntry.details,
      previousHash: kycCase.auditTrail.at(-1)?.immutableHash ?? "root",
    })
  );

  return {
    ...kycCase,
    auditTrail: [...kycCase.auditTrail, auditEntry],
    updatedAt: auditEntry.timestamp,
  };
}

function weightedLayer(
  key: TrustLayerResult["key"],
  label: string,
  score: number,
  weight: number,
  status: TrustLayerResult["status"],
  reason: string
): TrustLayerResult {
  return { key, label, score, weight, status, reason };
}

function cryptoRandomToken(length: number) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function assertValidTransition(from: WhatsAppCaseStatus, to: WhatsAppCaseStatus) {
  if (!canTransitionCase(from, to)) {
    throw new Error(`Invalid case transition from '${from}' to '${to}'.`);
  }
}

function buildMissingItems(kycCase: WhatsAppKycCase) {
  const missing: string[] = [];
  if (!kycCase.applicant.consentGiven) missing.push("consent");
  if (!kycCase.applicant.fullName) missing.push("full_name");
  if (!kycCase.verification.idValidation?.isValid) missing.push("sa_id_validation");
  if (!kycCase.verification.livenessScore) missing.push("liveness");
  if (kycCase.verification.otp?.status !== "verified") missing.push("otp_verification");
  if (!kycCase.verification.proofOfAddressProvided && !kycCase.verification.digitalAffidavitProvided) missing.push("address_or_affidavit");
  if (!kycCase.verification.locationShared && !kycCase.residenceEvidence?.gpsCoordinates && !kycCase.residenceEvidence?.towerId) {
    missing.push("location");
  }
  return missing;
}

function buildProviderResidenceEvidence(towerId: string | undefined, locationEvidence: string | undefined, capturedAt: string): ResidenceEvidence {
  return {
    source: "provider_batch",
    towerId,
    locationEvidence,
    gpsCoordinates: parseGpsEvidence(locationEvidence),
    capturedAt,
  };
}

function parseGpsEvidence(value?: string) {
  const match = value?.match(/GPS:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  };
}

function signSessionPayload(payload: Record<string, unknown>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = hashValue(`${encodedPayload}.${getSessionSecret()}`);
  return `${encodedPayload}.${signature}`;
}

function getSessionSecret() {
  return process.env.WHATSAPP_SESSION_SECRET ?? "dev-whatsapp-session-secret";
}

function hashValue(value: string) {
  return Buffer.from(value, "utf8")
    .reduce((acc, byte, index) => (acc + byte * (index + 1)) % 2147483647, 7)
    .toString(16)
    .padStart(8, "0");
}
