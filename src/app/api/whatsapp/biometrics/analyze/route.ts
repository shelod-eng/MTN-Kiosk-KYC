import { NextRequest, NextResponse } from "next/server";
import { runBiometricProvider } from "@/lib/provider-adapters";
import { updateFromWebhook } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    caseId?: string;
    selfieUrl?: string;
    idDocumentUrl?: string;
  };

  if (!body.caseId) {
    return NextResponse.json({ error: "Missing caseId." }, { status: 400 });
  }

  const result = await runBiometricProvider({
    caseId: body.caseId,
    selfieUrl: body.selfieUrl,
    idDocumentUrl: body.idDocumentUrl,
  });

  const updatedCase = await updateFromWebhook({
    caseId: body.caseId,
    event: "selfie_captured",
    actorId: "secure-session",
    details: {
      livenessScore: result.livenessScore,
      faceMatchScore: result.faceMatchScore,
      selfieUrl: body.selfieUrl ?? "secure-session-selfie-demo.jpg",
    },
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    provider: result.provider,
    providerReference: result.providerReference,
    livenessScore: result.livenessScore,
    faceMatchScore: result.faceMatchScore,
    status: updatedCase.status,
  });
}
