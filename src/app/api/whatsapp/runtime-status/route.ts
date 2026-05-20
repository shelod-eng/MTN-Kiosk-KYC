import { NextResponse } from "next/server";
import { getPersistenceMode } from "@/lib/whatsapp-store";

export async function GET() {
  return NextResponse.json({
    persistence: getPersistenceMode(),
    providers: {
      otp: process.env.OTP_PROVIDER ?? "mock",
      biometrics: process.env.BIOMETRIC_PROVIDER ?? "mock",
      what3words: process.env.WHAT3WORDS_API_KEY ? "configured" : "mock",
    },
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  });
}
