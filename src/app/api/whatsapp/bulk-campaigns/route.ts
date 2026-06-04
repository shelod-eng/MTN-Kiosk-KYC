import { NextRequest, NextResponse } from "next/server";
import { ingestBulkCampaign, type NetworkProvider } from "@/lib/bulk-campaign";
import { requirePermission } from "@/lib/staff-auth";

const providers = new Set<NetworkProvider>(["MTN", "Vodacom", "Cell C"]);

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:initiate");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body = (await request.json()) as {
    provider?: NetworkProvider;
    csv?: string;
    source?: "upload" | "paste" | "sftp";
    sourceFileName?: string;
  };

  if (!body.provider || !providers.has(body.provider)) {
    return NextResponse.json({ error: "Choose a supported provider: MTN, Vodacom, or Cell C." }, { status: 400 });
  }

  if (!body.csv?.trim()) {
    return NextResponse.json({ error: "Bulk campaign CSV is required." }, { status: 400 });
  }

  const result = await ingestBulkCampaign({
    provider: body.provider,
    csv: body.csv,
    source: body.source ?? "paste",
    sourceFileName: body.sourceFileName,
    staff: {
      staffId: auth.context.staffId,
      staffName: auth.context.staffName,
      staffRole: auth.context.staffRole,
    },
  });

  return NextResponse.json({
    batch: result,
    initiatedBy: auth.context,
    messageTemplate: "Tap the secure link to continue your KYC-Now verification on WhatsApp.",
  });
}
