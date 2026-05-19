import { NextResponse } from "next/server";
import { sampleCases } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    cases: sampleCases,
  });
}
