import { NextRequest, NextResponse } from "next/server";
import { captureAffidavit } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    caseId?: string;
    name?: string;
    address?: string;
    declarationAccepted?: boolean;
    responses?: Array<{ question: string; answer: string }>;
    videoUrl?: string;
  };

  if (!body.caseId || !body.name || !body.address || !body.declarationAccepted) {
    return NextResponse.json({ error: "Missing affidavit payload fields." }, { status: 400 });
  }

  const updatedCase = await captureAffidavit(body.caseId, {
    name: body.name,
    address: body.address,
    declarationAccepted: body.declarationAccepted,
    responses: body.responses ?? [],
    videoUrl: body.videoUrl,
    capturedAt: new Date().toISOString(),
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    affidavit: updatedCase.affidavit,
    status: updatedCase.status,
  });
}
