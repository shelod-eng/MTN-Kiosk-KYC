import { NextRequest, NextResponse } from "next/server";
import { captureAffidavit } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    caseId?: string;
    name?: string;
    address?: string;
    declarationAccepted?: boolean;
    responses?: Array<{ question: string; answer: string }>;
    affidavitText?: string;
    videoUrl?: string;
    imageUrl?: string;
  };

  if (!body.caseId || !body.name || !body.address || !body.declarationAccepted) {
    return NextResponse.json({ error: "Missing affidavit payload fields." }, { status: 400 });
  }

  const aiResult = readAffidavitText(`${body.affidavitText ?? body.address}`);
  const updatedCase = await captureAffidavit(body.caseId, {
    name: body.name,
    address: aiResult.extractedAddress ?? body.address,
    declarationAccepted: body.declarationAccepted,
    responses: body.responses ?? [],
    affidavitText: body.affidavitText,
    extractedIdNumber: aiResult.extractedIdNumber,
    aiValidationScore: aiResult.score,
    aiExtractedAddress: aiResult.extractedAddress,
    aiReviewReason: aiResult.reviewReason,
    videoUrl: body.videoUrl,
    imageUrl: body.imageUrl,
    capturedAt: new Date().toISOString(),
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: updatedCase,
    affidavit: updatedCase.affidavit,
    aiValidation: aiResult,
    status: updatedCase.status,
  });
}

function readAffidavitText(value: string) {
  const normalized = value.trim();
  const mentionsAffidavit = /affidavit|declare|swear|confirm/i.test(normalized);
  const mentionsResidence = /address|reside|residence|home|settlement|zone|stand|shack|informal/i.test(normalized);
  const hasEnoughDetail = normalized.split(/\s+/).length >= 6;
  const extractedIdNumber = extractSaIdNumber(normalized);
  const score = Math.min(
    0.96,
    0.48 + (mentionsAffidavit ? 0.18 : 0) + (mentionsResidence ? 0.22 : 0) + (hasEnoughDetail ? 0.16 : 0) + (extractedIdNumber ? 0.08 : 0)
  );

  return {
    score,
    extractedAddress: normalized || undefined,
    extractedIdNumber,
    proofAccepted: score >= 0.72,
    informalSettlementDetected: /settlement|zone|stand|shack|informal/i.test(normalized),
    reviewReason: score >= 0.72 ? undefined : "Affidavit text needs clearer residence wording.",
  };
}

function extractSaIdNumber(text: string) {
  const digitsOnly = text.replace(/[^0-9]/g, "");
  const match = digitsOnly.match(/(\d{13})/);
  return match ? match[1] : undefined;
}
