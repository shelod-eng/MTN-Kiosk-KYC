export type SouthAfricanIdValidation = {
  isValid: boolean;
  normalized: string;
  dateOfBirth?: string;
  citizenship?: "citizen" | "resident";
  gender?: "female" | "male";
  errors: string[];
};

export function validateSouthAfricanIdNumber(rawValue: string): SouthAfricanIdValidation {
  const normalized = rawValue.replace(/\D/g, "");
  const errors: string[] = [];

  if (normalized.length !== 13) {
    errors.push("South African ID number must contain 13 digits.");
  }

  if (!/^\d{13}$/.test(normalized)) {
    errors.push("South African ID number may only contain digits.");
  }

  const birthDate = normalized.length >= 6 ? parseBirthDate(normalized.slice(0, 6)) : null;
  if (!birthDate) {
    errors.push("South African ID number has an invalid birth date segment.");
  }

  const citizenshipDigit = normalized[10];
  let citizenship: "citizen" | "resident" | undefined;
  if (citizenshipDigit === "0") citizenship = "citizen";
  if (citizenshipDigit === "1") citizenship = "resident";
  if (!citizenship) {
    errors.push("South African ID number has an invalid citizenship digit.");
  }

  const genderDigits = normalized.length >= 10 ? Number(normalized.slice(6, 10)) : Number.NaN;
  const gender = Number.isNaN(genderDigits) ? undefined : genderDigits >= 5000 ? "male" : "female";

  if (normalized.length === 13 && !passesLuhnLikeChecksum(normalized)) {
    errors.push("South African ID number failed checksum validation.");
  }

  return {
    isValid: errors.length === 0,
    normalized,
    dateOfBirth: birthDate ?? undefined,
    citizenship,
    gender,
    errors,
  };
}

function parseBirthDate(segment: string) {
  const year = Number(segment.slice(0, 2));
  const month = Number(segment.slice(2, 4));
  const day = Number(segment.slice(4, 6));

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const fullYear = year > 30 ? 1900 + year : 2000 + year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function passesLuhnLikeChecksum(value: string) {
  const digits = value.split("").map(Number);
  const oddSum = digits.filter((_, index) => index % 2 === 0).slice(0, 6).reduce((sum, digit) => sum + digit, 0);
  const evenConcat = digits
    .filter((_, index) => index % 2 === 1)
    .slice(0, 6)
    .join("");
  const doubled = String(Number(evenConcat) * 2)
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);

  const total = oddSum + doubled;
  const checksum = (10 - (total % 10)) % 10;
  return checksum === digits[12];
}
