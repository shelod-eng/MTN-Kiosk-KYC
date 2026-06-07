import { NextRequest, NextResponse } from "next/server";
import { getQueueSnapshot } from "@/lib/kyc-queue";
import { getPersistenceMode, listBulkBatches, listCases } from "@/lib/whatsapp-store";
import { requirePermission } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const [cases, bulkBatches, queue] = await Promise.all([listCases(), listBulkBatches(), getQueueSnapshot()]);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      requestedBy: auth.context,
      persistenceMode: getPersistenceMode(),
      cases,
      bulkBatches,
      queue,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
