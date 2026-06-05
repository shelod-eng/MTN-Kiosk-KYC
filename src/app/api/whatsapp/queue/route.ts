import { NextRequest, NextResponse } from "next/server";
import {
  enqueueKycCase,
  enqueueOtpDispatch,
  enqueueVerificationReport,
  getQueueSnapshot,
  type KycCaseJob,
  type OtpDispatchJob,
  type VerificationReportJob,
} from "@/lib/kyc-queue";

export async function GET() {
  return NextResponse.json(await getQueueSnapshot());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    queue?: "otp_dispatch" | "kyc_case" | "verification_report";
    data?: OtpDispatchJob | KycCaseJob | VerificationReportJob;
  };

  if (!body.queue || !body.data) {
    return NextResponse.json({ error: "Missing queue or data." }, { status: 400 });
  }

  if (body.queue === "otp_dispatch") {
    return NextResponse.json(await enqueueOtpDispatch(body.data as OtpDispatchJob));
  }

  if (body.queue === "kyc_case") {
    return NextResponse.json(await enqueueKycCase(body.data as KycCaseJob));
  }

  if (body.queue === "verification_report") {
    return NextResponse.json(await enqueueVerificationReport(body.data as VerificationReportJob));
  }

  return NextResponse.json({ error: "Unsupported queue." }, { status: 400 });
}
