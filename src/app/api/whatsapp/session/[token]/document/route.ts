import { NextRequest, NextResponse } from "next/server";
import { captureIdDocument, getCase, getCaseBySessionToken, saveCaseSnapshot } from "@/lib/whatsapp-store";
import { validateSecureSessionToken } from "@/lib/whatsapp-kyc";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

type LocalRouteContext = {
  params: Promise<{ token: string }>;
};

export async function POST(request: NextRequest, context: LocalRouteContext) {
  const { token } = await context.params;
  const body = (await request.json()) as {
    caseId?: string;
    documentUrl?: string;
    documentType?: string;
    fileName?: string;
    extractedIdNumber?: string;
    caseSnapshot?: WhatsAppKycCase;
  };

  const fallbackCaseId = typeof body.caseId === "string" ? body.caseId : "";
  const tokenPayload = validateSecureSessionToken(token);
  let kycCase =
    (await getCaseBySessionToken(token)) ??
    (tokenPayload?.caseId ? await getCase(tokenPayload.caseId) : null) ??
    (fallbackCaseId ? await getCase(fallbackCaseId) : null);

  const snapshotCaseId = tokenPayload?.caseId ?? fallbackCaseId;
  if (!kycCase && snapshotCaseId && body.caseSnapshot?.id === snapshotCaseId) {
    kycCase = await saveCaseSnapshot(body.caseSnapshot);
  }

  const caseId = kycCase?.id;
  if (!caseId) {
    return NextResponse.json({ error: "Session not found or expired. Please restart the WhatsApp KYC case." }, { status: 404 });
  }

  if (!body.documentUrl || !body.documentType) {
    return NextResponse.json({ error: "Missing document upload fields." }, { status: 400 });
  }

  const extractedIdNumber = body.extractedIdNumber ?? extractIdNumberFromPayload(body.documentUrl, body.fileName);
  const updatedCase = await captureIdDocument(caseId, {
    documentUrl: body.documentUrl,
    documentType: body.documentType,
    fileName: body.fileName,
    ocrConfidence: 0.93,
    extractedIdNumber,
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    ocr: {
      confidence: 0.93,
      documentType: body.documentType,
      fileName: body.fileName ?? "identity-document",
      extractedIdNumber: updatedCase.verification.identityDocument?.extractedIdNumber ?? null,
      extractedFullName: updatedCase.verification.identityDocument?.extractedFullName ?? null,
      matchedEnteredId: updatedCase.verification.identityDocument?.matchedEnteredId ?? null,
      extracted: {
        fullName: updatedCase.verification.identityDocument?.extractedFullName ?? updatedCase.applicant.fullName ?? "Pending",
        idNumber: updatedCase.verification.identityDocument?.extractedIdNumber ?? updatedCase.applicant.idNumber ?? "Pending",
        dateOfBirth: updatedCase.verification.idValidation?.dateOfBirth ?? "Pending",
        dhaStatus: updatedCase.verification.idValidation?.isValid ? "ready_for_dha_match" : "needs_correction",
      },
    },
  });
}

function extractIdNumberFromPayload(documentUrl: string | undefined, fileName: string | undefined) {
  const fromFileName = fileName?.match(/(\d{13})/); 
  if (fromFileName) return fromFileName[1];
  if (!documentUrl) return undefined;
  const fromUrl = documentUrl.match(/(\d{13})/);
  return fromUrl ? fromUrl[1] : undefined;
}
