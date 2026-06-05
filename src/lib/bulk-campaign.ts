import { createCase, createCaseSession, getCase, persistBulkBatch } from "@/lib/whatsapp-store";
import { normalizePhoneNumber, type StaffInitiationPayload, type WhatsAppKycCase } from "@/lib/whatsapp-kyc";

export type NetworkProvider = "MTN" | "Vodacom" | "Cell C";

export type BulkCampaignInput = {
  provider: NetworkProvider;
  csv: string;
  sourceFileName?: string;
  source: "upload" | "paste" | "sftp";
  staff: Pick<StaffInitiationPayload, "staffId" | "staffName" | "staffRole">;
};

export type BulkCampaignRow = {
  rowNumber: number;
  fullName: string;
  idNumber: string;
  phoneNumber: string;
  campaignId?: string;
  segment?: string;
  providerReference?: string;
  towerId?: string;
  locationEvidence?: string;
};

export type BulkCampaignError = {
  rowNumber: number;
  message: string;
};

export type BulkCampaignResult = {
  batchId: string;
  batchReference: string;
  provider: NetworkProvider;
  source: BulkCampaignInput["source"];
  sourceFileName: string;
  status: "validated" | "completed" | "completed_with_exceptions" | "failed";
  receivedAt: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  cases: WhatsAppKycCase[];
  errors: BulkCampaignError[];
  providerReport: string;
};

type ParsedCsv = {
  rows: Array<Record<string, string>>;
  errors: BulkCampaignError[];
};

const requiredHeaders = ["phoneNumber"] as const;

export async function ingestBulkCampaign(input: BulkCampaignInput): Promise<BulkCampaignResult> {
  const receivedAt = new Date().toISOString();
  const batchId = `bulk_${randomToken(10)}`;
  const batchReference = `BULK-${input.provider.replace(/\s/g, "").toUpperCase()}-${Date.now()}`;
  const sourceFileName = input.sourceFileName?.trim() || `${batchReference}.csv`;
  const parsed = parseCsv(input.csv);
  const normalizedRows = parsed.rows.map((row, index) => normalizeCampaignRow(row, index + 2));
  const validRows = normalizedRows.filter((row): row is BulkCampaignRow => !("message" in row));
  const rowErrors = normalizedRows.filter((row): row is BulkCampaignError => "message" in row);
  const errors = [...parsed.errors, ...rowErrors];
  const cases: WhatsAppKycCase[] = [];

  for (const row of validRows) {
    const kycCase = await createCase({
      staffId: input.staff.staffId,
      staffName: input.staff.staffName,
      staffRole: input.staff.staffRole,
      tenant: input.provider,
      customerPhoneNumber: row.phoneNumber,
      deliveryMethod: "whatsapp",
      notes: `Bulk campaign ${batchReference}${row.campaignId ? ` / ${row.campaignId}` : ""}`,
      applicant: {
        fullName: row.fullName,
        idNumber: row.idNumber,
        phoneNumber: row.phoneNumber,
      },
      bulkCampaign: {
        batchId,
        batchReference,
        rowNumber: row.rowNumber,
        source: input.source,
        sourceFileName,
        campaignId: row.campaignId,
        segment: row.segment,
        providerReference: row.providerReference,
        towerId: row.towerId,
        locationEvidence: row.locationEvidence,
      },
    });
    await createCaseSession(kycCase.id);
    cases.push((await getCase(kycCase.id)) ?? kycCase);
  }

  const status = cases.length === 0 ? "failed" : errors.length > 0 ? "completed_with_exceptions" : "completed";
  const result: BulkCampaignResult = {
    batchId,
    batchReference,
    provider: input.provider,
    source: input.source,
    sourceFileName,
    status,
    receivedAt,
    rowCount: parsed.rows.length,
    validCount: validRows.length,
    errorCount: errors.length,
    cases,
    errors,
    providerReport: buildProviderReport(batchReference, input.provider, sourceFileName, cases, errors),
  };

  await persistBulkBatch(result, validRows);
  return result;
}

export function parseCsv(value: string): ParsedCsv {
  const rows = parseCsvRows(value);
  const errors: BulkCampaignError[] = [];

  if (rows.length < 2) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "CSV requires a header row and at least one customer row." }],
    };
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  const headerIndexes = {
    fullName: findHeader(headers, ["fullname", "full_name", "name", "customername", "customer_name"]),
    idNumber: findHeader(headers, ["idnumber", "id_number", "said", "sa_id", "ricaid", "ficaid"]),
    phoneNumber: findHeader(headers, ["phonenumber", "phone_number", "phone", "msisdn", "mobile", "cell"]),
    campaignId: findHeader(headers, ["campaignid", "campaign_id"]),
    segment: findHeader(headers, ["segment"]),
    providerReference: findHeader(headers, ["providerreference", "provider_reference", "reference"]),
    towerId: findHeader(headers, ["towerid", "tower_id", "celltowerid", "cell_tower_id"]),
    locationEvidence: findHeader(headers, ["locationevidence", "location_evidence", "residenceevidence", "residence_evidence"]),
  };

  for (const header of requiredHeaders) {
    if (headerIndexes[header] < 0) {
      errors.push({ rowNumber: 1, message: `Missing required column '${header}'.` });
    }
  }

  if (errors.length > 0) return { rows: [], errors };

  return {
    rows: rows
      .slice(1)
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => ({
        fullName: row[headerIndexes.fullName]?.trim() ?? "",
        idNumber: row[headerIndexes.idNumber]?.trim() ?? "",
        phoneNumber: row[headerIndexes.phoneNumber]?.trim() ?? "",
        campaignId: optionalCell(row, headerIndexes.campaignId),
        segment: optionalCell(row, headerIndexes.segment),
        providerReference: optionalCell(row, headerIndexes.providerReference),
        towerId: optionalCell(row, headerIndexes.towerId),
        locationEvidence: optionalCell(row, headerIndexes.locationEvidence),
      })),
    errors,
  };
}

function normalizeCampaignRow(row: Record<string, string>, rowNumber: number): BulkCampaignRow | BulkCampaignError {
  const idNumber = row.idNumber.replace(/\D/g, "");
  const phoneNumber = normalizePhoneNumber(row.phoneNumber);

  if (!row.fullName.trim()) {
    row.fullName = "";
  }

  if (idNumber && !/^\d{13}$/.test(idNumber)) {
    return { rowNumber, message: "idNumber must contain 13 digits." };
  }

  if (!/^\+27\d{9}$/.test(phoneNumber)) {
    return { rowNumber, message: "phoneNumber must normalize to a South African +27 E.164 number." };
  }

  return {
    rowNumber,
    fullName: row.fullName.trim(),
    idNumber,
    phoneNumber,
    campaignId: row.campaignId || undefined,
    segment: row.segment || undefined,
    providerReference: row.providerReference || undefined,
    towerId: row.towerId || undefined,
    locationEvidence: row.locationEvidence || undefined,
  };
}

function parseCsvRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function buildProviderReport(
  batchReference: string,
  provider: NetworkProvider,
  sourceFileName: string,
  cases: WhatsAppKycCase[],
  errors: BulkCampaignError[]
) {
  const header = [
    "batchReference",
    "provider",
    "sourceFileName",
    "msisdn",
    "caseReference",
    "finalStatus",
    "finalDecision",
    "riskScore",
    "missingItems",
    "completedChecks",
    "towerId",
    "locationEvidence",
    "generatedAt",
  ];
  const generatedAt = new Date().toISOString();
  const caseRows = cases.map((kycCase) =>
    [
      batchReference,
      provider,
      sourceFileName,
      kycCase.applicant.phoneNumber ?? kycCase.staffInitiation.customerPhoneNumber,
      kycCase.reference,
      kycCase.status,
      kycCase.risk?.decision ?? "PENDING",
      kycCase.risk?.score ?? "",
      missingItems(kycCase).join("|"),
      completedChecks(kycCase).join("|"),
      kycCase.residenceEvidence?.towerId ?? kycCase.staffInitiation.bulkCampaign?.towerId ?? "",
      kycCase.residenceEvidence?.locationEvidence ?? kycCase.staffInitiation.bulkCampaign?.locationEvidence ?? "",
      generatedAt,
    ].map(escapeCsvCell)
  );
  const errorRows = errors.map((error) =>
    [
      batchReference,
      provider,
      sourceFileName,
      "",
      `ROW-${error.rowNumber}`,
      "failed",
      "ERROR",
      "",
      error.message,
      "",
      "",
      "",
      generatedAt,
    ].map(escapeCsvCell)
  );

  return [header, ...caseRows, ...errorRows].map((row) => row.join(",")).join("\n");
}

function completedChecks(kycCase: WhatsAppKycCase) {
  const hasLocationEvidence = Boolean(
    kycCase.verification.locationShared || kycCase.residenceEvidence?.gpsCoordinates || kycCase.residenceEvidence?.towerId
  );
  return [
    kycCase.applicant.consentGiven ? "consent" : "",
    kycCase.applicant.fullName ? "details" : "",
    kycCase.verification.otp?.status === "verified" ? "otp" : "",
    kycCase.verification.livenessScore ? "liveness" : "",
    kycCase.verification.proofOfAddressProvided || kycCase.verification.digitalAffidavitProvided ? "address" : "",
    hasLocationEvidence ? "location" : "",
  ].filter(Boolean);
}

function missingItems(kycCase: WhatsAppKycCase) {
  const hasLocationEvidence = Boolean(
    kycCase.verification.locationShared || kycCase.residenceEvidence?.gpsCoordinates || kycCase.residenceEvidence?.towerId
  );
  return [
    kycCase.applicant.consentGiven ? "" : "consent",
    kycCase.verification.otp?.status === "verified" ? "" : "otp",
    kycCase.verification.livenessScore ? "" : "liveness",
    kycCase.verification.proofOfAddressProvided || kycCase.verification.digitalAffidavitProvided ? "" : "address_or_affidavit",
    hasLocationEvidence ? "" : "location",
  ].filter(Boolean);
}

function optionalCell(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function normalizeHeader(header: string) {
  return header.trim().replace(/^\uFEFF/, "");
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header.replace(/[^a-z0-9]/gi, "").toLowerCase()));
}

function escapeCsvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function randomToken(length: number) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}
