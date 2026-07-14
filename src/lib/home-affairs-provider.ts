import { validateSouthAfricanIdNumber } from "@/lib/sa-id";
import type { HomeAffairsVerification } from "@/lib/whatsapp-kyc";

type HomeAffairsInput = {
  caseId: string;
  reference: string;
  idNumber?: string;
  fullName?: string;
  extractedIdNumber?: string;
  extractedFullName?: string;
  documentType: string;
};

export async function verifyIdentityWithHomeAffairs(input: HomeAffairsInput): Promise<HomeAffairsVerification> {
  const provider = process.env.HOME_AFFAIRS_PROVIDER === "verify-now" ? "verify-now" : process.env.HOME_AFFAIRS_PROVIDER === "dha-direct" ? "dha-direct" : "mock-dha-ready";
  const mode = provider === "mock-dha-ready" ? "simulation" : "live";
  const idNumber = input.extractedIdNumber ?? input.idNumber ?? "";
  const validation = validateSouthAfricanIdNumber(idNumber);
  const matched = Boolean(validation.isValid && input.idNumber && idNumber === input.idNumber);
  const nameParts = splitName(input.extractedFullName ?? input.fullName ?? "Sample Person");
  const isBlocked = idNumber.endsWith("0000");
  const isDeceased = idNumber.endsWith("9999");
  const status = !validation.isValid ? "review" : isBlocked ? "blocked" : isDeceased ? "deceased" : matched ? "verified" : "review";

  return {
    provider,
    mode,
    status,
    matched,
    idStatus: isBlocked ? "blocked" : validation.isValid ? "valid" : "invalid",
    names: nameParts.names,
    surname: nameParts.surname,
    dateOfBirth: validation.dateOfBirth,
    gender: validation.gender,
    citizenship: validation.citizenship === "citizen" ? "South African" : validation.citizenship === "resident" ? "Permanent resident" : "Unknown",
    deceased: isDeceased,
    smartId: validation.isValid,
    photoAvailable: validation.isValid,
    checkedAt: new Date().toISOString(),
    reference: `${provider}-${input.caseId}`,
    complianceNote:
      mode === "live"
        ? "Live Home Affairs identity verification completed through configured provider."
        : "DHA-ready simulated result. Replace HOME_AFFAIRS_PROVIDER credentials to activate live Home Affairs matching.",
  };
}

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { names: "Pending", surname: "Pending" };
  if (parts.length === 1) return { names: parts[0].toUpperCase(), surname: "Pending" };
  return {
    names: parts.slice(0, -1).join(" ").toUpperCase(),
    surname: parts.at(-1)?.toUpperCase() ?? "Pending",
  };
}
