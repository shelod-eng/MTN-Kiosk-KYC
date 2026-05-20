import { NextRequest, NextResponse } from "next/server";
import { updateFromWebhook } from "@/lib/whatsapp-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string; videoUrl?: string };
  if (!body.caseId || !body.videoUrl) {
    return NextResponse.json({ error: "Missing caseId or videoUrl." }, { status: 400 });
  }

  const updatedCase = await updateFromWebhook({
    caseId: body.caseId,
    event: "affidavit_submitted",
    actorId: "secure-session",
    details: {
      videoUrl: body.videoUrl,
    },
  });

  if (!updatedCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    caseId: updatedCase.id,
    status: updatedCase.status,
    affidavitVideo: updatedCase.documentUrls.affidavitVideo,
  });
}
