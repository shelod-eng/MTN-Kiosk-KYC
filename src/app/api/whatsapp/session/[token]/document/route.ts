import { NextRequest, NextResponse } from "next/server";
import { captureIdDocument, getCaseBySessionToken } from "@/lib/whatsapp-store";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const kycCase = await getCaseBySessionToken(token);
  if (!kycCase) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  const body = (await request.json()) as {
    documentUrl?: string;
    documentType?: string;
    fileName?: string;
  };

  if (!body.documentUrl || !body.documentType) {
    return NextResponse.json({ error: "Missing document upload fields." }, { status: 400 });
  }

  const updatedCase = await captureIdDocument(kycCase.id, {
    documentUrl: body.documentUrl,
    documentType: body.documentType,
    ocrConfidence: 0.93,
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
      extracted: {
        fullName: updatedCase.applicant.fullName ?? "Pending",
        idNumber: updatedCase.applicant.idNumber ?? "Pending",
        dateOfBirth: updatedCase.verification.idValidation?.dateOfBirth ?? "Pending",
        dhaStatus: updatedCase.verification.idValidation?.isValid ? "ready_for_dha_match" : "needs_correction",
      },
    },
  });
}
