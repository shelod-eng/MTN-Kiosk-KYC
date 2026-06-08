'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";
import { validateSouthAfricanIdNumber } from "@/lib/sa-id";

const staffHeaders = {
  "Content-Type": "application/json",
  "x-staff-id": "mno-batch-agent-001",
  "x-staff-name": "MNO Batch Agent",
  "x-staff-role": "supervisor",
};

type NetworkProvider = "MTN" | "Vodacom" | "Cell C";
type IntakeMode = "single" | "bulk";
type ChatStep = "seed" | "otp" | "fullName" | "idNumber" | "idDocument" | "address" | "selfie" | "verification" | "complete";
type Message = {
  id: string;
  sender: "platform" | "customer";
  text: string;
  timestamp: string;
};
type VerificationReport = {
  reference: string;
  status: string;
  decision: string;
  score: number | null;
  simulation: { score: number; band: string };
  evidence: {
    locationDescription: string;
    towerId: string | null;
    ipAddress: string | null;
    deviceDescription: string;
  };
  checks: Array<{ name: string; status: "DONE" | "PENDING" | "REVIEW"; score: number; detail: string }>;
};
type BulkCampaignBatch = {
  batchId: string;
  batchReference: string;
  provider: NetworkProvider;
  status: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  cases: WhatsAppKycCase[];
  errors: Array<{ rowNumber: number; message: string }>;
  providerReport: string;
};

const sampleCustomer = {
  phoneNumber: "+27785929455",
  fullName: "Lebohang Mpeta",
  idNumber: "8306125876089",
  affidavit:
    "I declare that I reside at Informal Settlement Zone 7, Stand 42, Ivory Park. I do not have a municipal utility bill and confirm this is my home address.",
};
const sampleBulkCsv =
  "phoneNumber\n+27821234567\n+27731234567\n+27611234567";

export function WhatsAppKycChatDemo() {
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("single");
  const [provider, setProvider] = useState<NetworkProvider>("MTN");
  const [step, setStep] = useState<ChatStep>("seed");
  const [caseItem, setCaseItem] = useState<WhatsAppKycCase | null>(null);
  const [singleMsisdn, setSingleMsisdn] = useState(sampleCustomer.phoneNumber);
  const [bulkCsv, setBulkCsv] = useState(sampleBulkCsv);
  const [bulkFileName, setBulkFileName] = useState("mno-msisdn-batch.csv");
  const [batch, setBatch] = useState<BulkCampaignBatch | null>(null);
  const [queueCases, setQueueCases] = useState<WhatsAppKycCase[]>([]);
  const [queueMessage, setQueueMessage] = useState("No batch loaded yet.");
  const [fullName, setFullName] = useState(sampleCustomer.fullName);
  const [idNumber, setIdNumber] = useState(sampleCustomer.idNumber);
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [selfieState, setSelfieState] = useState<"idle" | "camera" | "analyzing" | "captured" | "error">("idle");
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [reportCsv, setReportCsv] = useState("");
  const [reportOpen, setReportOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    platformMessage("MNO batch simulation ready. Seed one MSISDN, send OTP, and complete the full KYC journey in this WhatsApp chat."),
  ]);
  const idInputRef = useRef<HTMLInputElement | null>(null);
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const headerStatus = useMemo(() => {
    if (!caseItem) return "Batch MSISDN pending";
    return `${caseItem.reference} - ${caseItem.status}`;
  }, [caseItem]);

  useEffect(() => {
    if (selfieState !== "camera" || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [selfieState]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  function addMessage(sender: Message["sender"], text: string) {
    setMessages((current) => [...current, makeMessage(sender, text)]);
  }

  function resetCurrentFlow(nextProvider = provider, openingMessage = "Ready for the next MSISDN. Choose single or bulk intake to begin.") {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setProvider(nextProvider);
    setStep("seed");
    setCaseItem(null);
    setFullName(sampleCustomer.fullName);
    setIdNumber(sampleCustomer.idNumber);
    setInputValue("");
    setSelfieState("idle");
    setSelfiePreview(null);
    setReport(null);
    setReportCsv("");
    setReportOpen(true);
    setMessages([platformMessage(openingMessage)]);
  }

  function applyCaseUpdate(nextCase: WhatsAppKycCase) {
    setCaseItem(nextCase);
    setQueueCases((current) => current.map((candidate) => (candidate.id === nextCase.id ? nextCase : candidate)));
  }

  async function sendOtpForCase(nextCase: WhatsAppKycCase, sourceText: string) {
    addMessage("platform", sourceText);
    const otpResponse = await fetch("/api/whatsapp/otp/send", {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({ caseId: nextCase.id, caseSnapshot: nextCase }),
    });
    const otpPayload = (await otpResponse.json()) as { status?: string; error?: string };
    if (!otpResponse.ok) {
      addMessage("platform", otpPayload.error ?? "Could not dispatch OTP for this queued MSISDN.");
      return;
    }
    const otpCase = { ...nextCase, status: (otpPayload.status as WhatsAppKycCase["status"]) ?? "otp_pending" };
    applyCaseUpdate(otpCase);
    setStep("otp");
    addMessage("platform", `Your ${nextCase.tenant} KYC-Now OTP is 123456. Enter it here to verify this WhatsApp number.`);
  }

  async function seedMsisdnAndSendOtp() {
    await run(async () => {
      const normalizedMsisdn = singleMsisdn.trim();
      const initiateResponse = await fetch("/api/whatsapp/staff/initiate", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          tenant: provider,
          customerPhoneNumber: normalizedMsisdn,
          deliveryMethod: "whatsapp",
          notes: "Single MSISDN intake for WhatsApp KYC renewal flow",
        }),
      });
      const initiatePayload = (await initiateResponse.json()) as { case?: WhatsAppKycCase; error?: string };
      if (!initiatePayload.case) {
        addMessage("platform", initiatePayload.error ?? "Could not create the WhatsApp KYC case.");
        return;
      }
      await sendOtpForCase(initiatePayload.case, `${provider} supplied single MSISDN ${normalizedMsisdn}.`);
    });
  }

  async function ingestBulkBatch() {
    await run(async () => {
      setQueueMessage("Ingesting bulk MSISDN file...");
      const response = await fetch("/api/whatsapp/bulk-campaigns", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          provider,
          csv: bulkCsv,
          source: "upload",
          sourceFileName: bulkFileName,
        }),
      });
      const payload = (await response.json()) as { batch?: BulkCampaignBatch; error?: string };
      if (!response.ok || !payload.batch) {
        setQueueMessage(payload.error ?? "Bulk campaign ingestion failed.");
        addMessage("platform", payload.error ?? "Bulk campaign ingestion failed.");
        return;
      }

      setBatch(payload.batch);
      setQueueCases(payload.batch.cases);
      setQueueMessage(`${payload.batch.validCount} case(s) queued from ${payload.batch.batchReference}. Select an MSISDN to dispatch OTP.`);
      addMessage(
        "platform",
        `${provider} bulk file loaded: ${payload.batch.validCount} case(s), ${payload.batch.errorCount} error(s). Select a queued MSISDN to start its WhatsApp KYC flow.`
      );
    });
  }

  async function loadBulkCsvFile(file: File | null) {
    if (!file) return;
    setBulkFileName(file.name);
    setBulkCsv(await file.text());
  }

  async function startQueuedCase(nextCase: WhatsAppKycCase) {
    await run(async () => {
      resetCurrentFlow(nextCase.tenant, `Selected ${nextCase.tenant} queued MSISDN ${nextCase.applicant.phoneNumber ?? nextCase.staffInitiation.customerPhoneNumber}.`);
      setIntakeMode("bulk");
      setCaseItem(nextCase);
      setFullName(nextCase.applicant.fullName ?? sampleCustomer.fullName);
      setIdNumber(nextCase.applicant.idNumber ?? sampleCustomer.idNumber);
      await sendOtpForCase(nextCase, `${nextCase.tenant} queued case ${nextCase.reference} is ready for WhatsApp dispatch.`);
    });
  }

  async function handleTextSubmit() {
    const value = inputValue.trim();
    if (!value || busy) return;
    setInputValue("");
    addMessage("customer", value);

    if (step === "otp") {
      await verifyOtp(value);
      return;
    }

    if (step === "fullName") {
      setFullName(value);
      setStep("idNumber");
      addMessage("platform", "Thanks. Please enter your South African ID number.");
      return;
    }

    if (step === "idNumber") {
      const validation = validateSouthAfricanIdNumber(value);
      if (!validation.isValid) {
        addMessage("platform", `That SA ID number did not pass validation. ${validation.errors.join(" ")} Please enter a valid 13-digit SA ID number.`);
        return;
      }
      setIdNumber(validation.normalized);
      await submitApplicantDetails(validation.normalized);
      return;
    }

    if (step === "address") {
      await submitAffidavit(value);
    }
  }

  async function verifyOtp(code: string) {
    if (!caseItem) return;
    await run(async () => {
      const response = await fetch("/api/whatsapp/otp/verify", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id, code }),
      });
      const payload = (await response.json()) as { case?: WhatsAppKycCase; error?: string };
      if (!response.ok || !payload.case) {
        addMessage("platform", payload.error ?? "OTP verification failed. Try 123456 for the demo.");
        return;
      }
      applyCaseUpdate(payload.case);
      setStep("fullName");
      addMessage("platform", "OTP approved. MSISDN verified. Please enter your full name.");
    });
  }

  async function submitApplicantDetails(nextIdNumber: string) {
    if (!caseItem) return;
    await run(async () => {
      const response = await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          event: "details_submitted",
          details: {
            fullName,
            idNumber: nextIdNumber,
            phoneNumber: caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber,
          },
        }),
      });
      const payload = (await response.json()) as { case?: WhatsAppKycCase; error?: string };
      if (!payload.case) {
        addMessage("platform", payload.error ?? "Could not save applicant details.");
        return;
      }
      applyCaseUpdate(payload.case);
      setStep("idDocument");
      addMessage("platform", "ID checksum passed and details were saved. Attach your ID, driver's license, or passport for OCR.");
    });
  }

  async function uploadIdDocument(file: File | null) {
    if (!caseItem?.secureSessionToken) return;
    if (!file) return;
    await run(async () => {
      const documentUrl = await readFileAsDataUrl(file);
      const documentType = inferIdentityDocumentType(file.name);
      const token = encodeURIComponent(caseItem.secureSessionToken);
      addMessage("customer", `Attached ${file.name}.`);
      const response = await fetch(`/api/whatsapp/session/${token}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: caseItem.id,
          documentUrl,
          documentType,
          fileName: file.name,
        }),
      });
      const payload = response.ok
        ? ((await response.json()) as { case?: WhatsAppKycCase; ocr?: { confidence: number; fileName?: string }; error?: string })
        : { error: await readApiError(response) };
      if (!response.ok || !payload.case) {
        addMessage("platform", payload.error ?? "Could not process the ID document.");
        return;
      }
      applyCaseUpdate(payload.case);
      setStep("address");
      addMessage(
        "platform",
        `ID OCR completed for ${payload.ocr?.fileName ?? file.name} at ${Math.round((payload.ocr?.confidence ?? 0.93) * 100)}%. Upload proof of address or type affidavit text next.`
      );
    });
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSelfieState("error");
      addMessage("platform", "Camera capture is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setSelfieState("camera");
      addMessage("platform", "Camera is live. Center your face and tap Capture and verify.");
    } catch {
      setSelfieState("error");
      addMessage("platform", "Camera permission was blocked or no camera is available.");
    }
  }

  async function captureSelfieFingerprint() {
    if (!caseItem?.secureSessionToken) return;
    if (!videoRef.current) {
      await openCamera();
      return;
    }
    await run(async () => {
      setSelfieState("analyzing");
      await waitForVideo(videoRef.current as HTMLVideoElement);
      const selfieImage = captureVideoFrame(videoRef.current as HTMLVideoElement);
      if (!selfieImage) {
        setSelfieState("error");
        addMessage("platform", "Unable to capture a selfie frame from the camera.");
        return;
      }
      setSelfiePreview(selfieImage);
      addMessage("customer", "Captured selfie from live camera.");
      const token = encodeURIComponent(caseItem.secureSessionToken);
      const deviceResponse = await fetch(`/api/whatsapp/session/${token}/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildDeviceFingerprint(), caseId: caseItem.id }),
      });
      const devicePayload = (await deviceResponse.json().catch(() => null)) as { case?: WhatsAppKycCase } | null;
      if (devicePayload?.case) applyCaseUpdate(devicePayload.case);
      const locationResult = await captureBrowserLocation(token);
      if (locationResult.case) applyCaseUpdate(locationResult.case);
      const biometricResponse = await fetch("/api/whatsapp/biometrics/analyze", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          selfieUrl: selfieImage,
          idDocumentUrl: caseItem.documentUrls.idDocument ?? "whatsapp-id-document.jpg",
        }),
      });
      const biometricPayload = (await biometricResponse.json()) as { case?: WhatsAppKycCase; livenessScore?: number; faceMatchScore?: number };
      if (biometricPayload.case) applyCaseUpdate(biometricPayload.case);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setSelfieState("captured");
      setStep("verification");
      addMessage(
        "platform",
        `Selfie verified against the uploaded ID. Liveness ${Math.round((biometricPayload.livenessScore ?? 0.91) * 100)}%, face match ${Math.round((biometricPayload.faceMatchScore ?? 0.89) * 100)}%. GPS ${locationResult.locationText}, tower ${locationResult.towerId ?? "pending"}, IP ${biometricPayload.case?.deviceIntelligence?.ipAddress ?? devicePayload?.case?.deviceIntelligence?.ipAddress ?? "captured by session endpoint"}. Run final verification checks.`
      );
    });
  }

  async function uploadProofOfAddress(file: File | null) {
    if (!caseItem) return;
    if (!file) return;
    await run(async () => {
      const proofOfAddressUrl = await readFileAsDataUrl(file);
      addMessage("customer", `Attached proof document ${file.name}.`);
      const response = await fetch("/api/whatsapp/address/upload", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          proofOfAddressUrl,
          fileName: file.name,
          documentType: inferProofDocumentType(file.name),
        }),
      });
      const payload = (await response.json()) as {
        case?: WhatsAppKycCase;
        proof?: { accepted?: boolean; reviewReason?: string };
        requiresAffidavitFallback?: boolean;
        fallbackReason?: string | null;
        error?: string;
      };
      if (payload.case) applyCaseUpdate(payload.case);
      if (payload.requiresAffidavitFallback) {
        setStep("address");
        addMessage(
          "platform",
          `${payload.fallbackReason ?? "Proof of address needs manual RICA review."} Please type or upload an affidavit confirming your residence before selfie/liveness verification.`
        );
        return;
      }
      setStep("selfie");
      addMessage("platform", "Proof of address OCR captured and accepted for KYC/RICA. Open camera and fingerprint for selfie/liveness verification.");
    });
  }

  async function submitAffidavit(text: string) {
    if (!caseItem) return;
    await run(async () => {
      const response = await fetch("/api/whatsapp/affidavit", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          name: fullName,
          address: text,
          declarationAccepted: true,
          affidavitText: text,
          responses: [
            { question: "Do you reside at this settlement?", answer: "Yes" },
            { question: "Do you have formal proof of address?", answer: "No" },
          ],
          videoUrl: "whatsapp-affidavit-video.mp4",
          imageUrl: "whatsapp-affidavit-image.png",
        }),
      });
      const payload = (await response.json()) as {
        case?: WhatsAppKycCase;
        aiValidation?: { score: number; proofAccepted: boolean };
        error?: string;
      };
      if (!payload.case) {
        addMessage("platform", payload.error ?? "Could not validate the affidavit.");
        return;
      }
      applyCaseUpdate(payload.case);
      setStep("selfie");
      addMessage(
        "platform",
        `Affidavit AI read complete. Validation ${Math.round((payload.aiValidation?.score ?? 0.8) * 100)}%, proof ${payload.aiValidation?.proofAccepted ? "accepted" : "needs review"}. Open camera and fingerprint for selfie/liveness verification.`
      );
    });
  }

  async function runFinalVerification() {
    if (!caseItem) return;
    await run(async () => {
      const response = await fetch("/api/whatsapp/verification", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id }),
      });
      const payload = (await response.json()) as {
        case?: WhatsAppKycCase;
        report?: VerificationReport;
        csv?: string;
        whatsappSummary?: string;
        error?: string;
      };
      if (!payload.case || !payload.report) {
        addMessage("platform", payload.error ?? "Final verification failed.");
        return;
      }
      applyCaseUpdate(payload.case);
      setReport(payload.report);
      setReportCsv(payload.csv ?? "");
      setStep("complete");
      addMessage("platform", payload.whatsappSummary ?? "KYC verification complete.");
    });
  }

  function downloadCsv() {
    if (!reportCsv || !report) return;
    const blob = new Blob([reportCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.reference}-whatsapp-verification-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#d6dbd7] text-[#111b21]">
      <section className="mx-auto grid min-h-screen max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[340px_1fr]">
        <aside className="hidden border border-[#c8d2cc] bg-[#f0f2f5] lg:block">
          <div className="bg-[#075e54] px-4 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d7fff0]">KYC-Now Demo</p>
            <h1 className="mt-1 text-xl font-semibold">MNO WhatsApp queue</h1>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#d8dfdc] bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  setIntakeMode("single");
                  if (step === "seed") setQueueMessage("Single MSISDN mode ready.");
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${intakeMode === "single" ? "bg-[#075e54] text-white" : "text-[#35524b]"}`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => {
                  setIntakeMode("bulk");
                  if (step === "seed") setQueueMessage(batch ? `${batch.validCount} queued case(s) loaded.` : "Paste or upload a bulk MSISDN CSV.");
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${intakeMode === "bulk" ? "bg-[#075e54] text-white" : "text-[#35524b]"}`}
              >
                Bulk
              </button>
            </div>

            <label className="block text-sm font-semibold text-[#34443f]">
              Provider
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as NetworkProvider)}
                className="mt-2 w-full border border-[#c8d2cc] bg-white px-3 py-2 text-sm"
                disabled={step !== "seed"}
              >
                <option value="MTN">MTN</option>
                <option value="Vodacom">Vodacom</option>
                <option value="Cell C">Cell C</option>
              </select>
            </label>

            {intakeMode === "single" ? (
              <div className="mt-4 border border-[#d8dfdc] bg-white p-3 text-sm leading-6 text-[#53625e]">
                <p className="font-semibold text-[#20312c]">Single MSISDN intake</p>
                <input
                  value={singleMsisdn}
                  onChange={(event) => setSingleMsisdn(event.target.value)}
                  className="mt-2 w-full border border-[#c8d2cc] px-3 py-2 text-sm"
                  disabled={step !== "seed"}
                  placeholder="+27..."
                />
                <button
                  type="button"
                  onClick={() => void seedMsisdnAndSendOtp()}
                  disabled={busy || step !== "seed"}
                  className="mt-3 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34] disabled:opacity-60"
                >
                  Send OTP
                </button>
              </div>
            ) : (
              <div className="mt-4 border border-[#d8dfdc] bg-white p-3 text-sm leading-6 text-[#53625e]">
                <p className="font-semibold text-[#20312c]">Bulk MSISDN intake</p>
                <input
                  value={bulkFileName}
                  onChange={(event) => setBulkFileName(event.target.value)}
                  className="mt-2 w-full border border-[#c8d2cc] px-3 py-2 text-sm"
                  disabled={busy}
                />
                <textarea
                  value={bulkCsv}
                  onChange={(event) => setBulkCsv(event.target.value)}
                  className="mt-2 min-h-28 w-full border border-[#c8d2cc] px-3 py-2 text-xs"
                  disabled={busy}
                />
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void loadBulkCsvFile(event.target.files?.[0] ?? null)}
                  className="mt-2 text-xs"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void ingestBulkBatch()}
                  disabled={busy}
                  className="mt-3 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34] disabled:opacity-60"
                >
                  Queue batch
                </button>
                <p className="mt-2 text-xs text-[#60746f]">{queueMessage}</p>
              </div>
            )}

            {queueCases.length > 0 && (
              <div className="mt-4 grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#60746f]">Queued MSISDNs</p>
                {queueCases.map((queuedCase) => (
                  <button
                    key={queuedCase.id}
                    type="button"
                    onClick={() => void startQueuedCase(queuedCase)}
                    className={`border px-3 py-2 text-left text-xs ${caseItem?.id === queuedCase.id ? "border-[#075e54] bg-[#dcf8c6]" : "border-[#d8dfdc] bg-white"}`}
                  >
                    <span className="block font-semibold text-[#20312c]">
                      {queuedCase.applicant.phoneNumber ?? queuedCase.staffInitiation.customerPhoneNumber}
                    </span>
                    <span className="block text-[#60746f]">
                      {queuedCase.reference} / {queuedCase.status} / {queuedCase.risk?.decision ?? "pending"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden border border-[#bfcac4] bg-[#efeae2] shadow-xl">
          <header className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <div className="grid size-11 place-items-center rounded-full bg-[#25d366] text-sm font-black text-[#063b34]">
              {provider.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{provider} KYC-Now</p>
              <p className="truncate text-xs text-[#d7fff0]">{headerStatus}</p>
            </div>
            <span className="rounded-full bg-[#128c7e] px-3 py-1 text-xs font-semibold">WhatsApp</span>
          </header>

          <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,rgba(7,94,84,0.08)_0_1px,transparent_1px)] p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {(selfieState === "camera" || selfieState === "analyzing" || selfiePreview) && (
                <section className="mt-3 max-w-md self-end overflow-hidden rounded-lg bg-[#dcf8c6] shadow-sm">
                  {selfieState === "camera" || selfieState === "analyzing" ? (
                    <>
                      <video ref={videoRef} className="aspect-square w-full bg-black object-cover" playsInline muted />
                      <div className="flex gap-2 p-3">
                        <button
                          type="button"
                          onClick={() => void captureSelfieFingerprint()}
                          disabled={busy || selfieState === "analyzing"}
                          className="rounded-full bg-[#075e54] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {selfieState === "analyzing" ? "Analyzing..." : "Capture and verify"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <img src={selfiePreview ?? ""} alt="Captured selfie evidence" className="aspect-square w-full object-cover" />
                  )}
                </section>
              )}

              {report && (
                <section className="mt-3 self-start rounded-lg bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setReportOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-semibold text-[#123a34]"
                  >
                    Verification report
                    <span>{reportOpen ? "Hide" : "Show"}</span>
                  </button>
                  {reportOpen && (
                    <div className="border-t border-[#e5ebe8] px-4 py-3">
                      <div className="grid gap-2 text-sm text-[#3f514c] sm:grid-cols-3">
                        <Metric label="Decision" value={report.decision} />
                        <Metric label="Final score" value={String(report.score ?? report.simulation.score)} />
                        <Metric label="Band" value={report.simulation.band} />
                        <Metric label="Nearest tower" value={report.evidence.towerId ?? "Not captured"} />
                      </div>
                      <div className="mt-3 grid gap-2">
                        {report.checks.map((check) => (
                          <div key={check.name} className="border border-[#edf1ef] bg-[#f7faf8] px-3 py-2 text-sm">
                            <p className="font-semibold text-[#183c35]">
                              {check.name}: {check.status} ({check.score})
                            </p>
                            <p className="mt-1 text-[#5d6d68]">{check.detail}</p>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={downloadCsv} className="mt-3 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34]">
                        Download CSV report
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>

          <footer className="border-t border-[#d1d8d4] bg-[#f0f2f5] p-3">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              {step === "seed" && (
                caseItem ? (
                  <button type="button" onClick={() => void sendOtpForCase(caseItem, `${caseItem.tenant} queued case ${caseItem.reference} is ready for WhatsApp dispatch.`)} className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34]" disabled={busy}>
                    Dispatch OTP to {caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber}
                  </button>
                ) : intakeMode === "single" ? (
                  <button type="button" onClick={() => void seedMsisdnAndSendOtp()} className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34]">
                    Send OTP to {singleMsisdn || "single MSISDN"}
                  </button>
                ) : (
                  <button type="button" onClick={() => void ingestBulkBatch()} className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34]">
                    Queue bulk batch
                  </button>
                )
              )}
              {step === "idDocument" && (
                <>
                  <AttachmentAction label="Upload ID / license / passport" busy={busy} onClick={async () => idInputRef.current?.click()} />
                  <input
                    ref={idInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(event) => void uploadIdDocument(event.target.files?.[0] ?? null)}
                  />
                </>
              )}
              {step === "selfie" && (
                <AttachmentAction
                  label={selfieState === "camera" ? "Capture and verify" : "Open camera + fingerprint"}
                  busy={busy}
                  onClick={selfieState === "camera" ? captureSelfieFingerprint : openCamera}
                />
              )}
              {step === "address" && (
                <>
                  <AttachmentAction label="Upload proof document" busy={busy} onClick={async () => proofInputRef.current?.click()} />
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(event) => void uploadProofOfAddress(event.target.files?.[0] ?? null)}
                  />
                </>
              )}
              {step === "verification" && <AttachmentAction label="Run final verification" busy={busy} onClick={runFinalVerification} />}
              {step !== "seed" && step !== "idDocument" && step !== "selfie" && step !== "verification" && step !== "complete" && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleTextSubmit();
                    }}
                    placeholder={placeholderFor(step)}
                    className="min-w-0 flex-1 rounded-full border border-[#d4ddda] bg-white px-4 py-3 text-sm outline-none focus:border-[#25d366]"
                  />
                  <button type="button" onClick={() => void handleTextSubmit()} className="rounded-full bg-[#075e54] px-5 py-3 text-sm font-bold text-white" disabled={busy}>
                    Send
                  </button>
                </div>
              )}
              {step === "complete" && (
                <>
                  <p className="text-sm font-semibold text-[#31524a]">Flow complete in one WhatsApp screen.</p>
                  <button
                    type="button"
                    onClick={() => resetCurrentFlow(provider)}
                    className="rounded-full bg-[#075e54] px-4 py-2 text-sm font-bold text-white"
                  >
                    Start new KYC
                  </button>
                </>
              )}
            </div>
          </footer>
        </section>
      </section>
    </main>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isCustomer = message.sender === "customer";
  return (
    <div className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-lg px-3 py-2 shadow-sm ${isCustomer ? "bg-[#dcf8c6]" : "bg-white"}`}>
        <p className="whitespace-pre-line text-sm leading-6 text-[#111b21]">{message.text}</p>
        <p className="mt-1 text-right text-[11px] text-[#667781]">{message.timestamp}</p>
      </div>
    </div>
  );
}

function AttachmentAction({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => Promise<void> }) {
  return (
    <button type="button" onClick={() => void onClick()} disabled={busy} className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#063b34] disabled:opacity-60">
      {busy ? "Working..." : label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#edf1ef] bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-[0.12em] text-[#72817d]">{label}</p>
      <p className="mt-1 font-semibold text-[#183c35]">{value}</p>
    </div>
  );
}

function placeholderFor(step: ChatStep) {
  if (step === "otp") return "Enter OTP 123456";
  if (step === "fullName") return "Enter full name";
  if (step === "idNumber") return "Enter SA ID number";
  if (step === "address") return "Type affidavit text or attach proof";
  return "Type a message";
}

function inferIdentityDocumentType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("driver") || normalized.includes("licence") || normalized.includes("license")) return "Driver's license";
  if (normalized.includes("passport")) return "Passport";
  return "South African ID document";
}

function inferProofDocumentType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("bank") || normalized.includes("capitec") || normalized.includes("statement") || normalized.includes("invoice") || normalized.includes("inv-")) return "Bank statement";
  if (normalized.includes("eskom") || normalized.includes("electric")) return "Eskom or municipal electricity account";
  if (normalized.includes("water") || normalized.includes("rates") || normalized.includes("municipal")) return "Water and rates account";
  if (normalized.includes("telkom") || normalized.includes("internet") || normalized.includes("isp")) return "Telkom or internet service provider invoice";
  return "Proof of address document";
}

async function readApiError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error ?? `Request failed with status ${response.status}.`;
  }

  return `Request failed with status ${response.status}. Please retry or restart the KYC case.`;
}

function buildDeviceFingerprint() {
  return {
    browserFingerprint: `${navigator.userAgent}:${screen.width}x${screen.height}:${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    operatingSystem: navigator.userAgent,
    browser: navigator.userAgent,
    screenSize: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    touchCapable: navigator.maxTouchPoints > 0,
    sessionContinuity: true,
    cookiesEnabled: navigator.cookieEnabled,
  };
}

async function captureBrowserLocation(token: string) {
  const fallback = { latitude: -26.2041, longitude: 28.0473, accuracy: 25 };
  const coords = await new Promise<{ latitude: number; longitude: number; accuracy?: number }>((resolve) => {
    if (!navigator.geolocation) {
      resolve(fallback);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve(fallback),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  const response = await fetch(`/api/whatsapp/session/${encodeURIComponent(token)}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coords),
  });
  const payload = response.ok
    ? ((await response.json()) as {
        case?: WhatsAppKycCase;
        what3words?: string;
        towerId?: string;
        location?: { latitude: number; longitude: number; accuracy?: number };
      })
    : { case: undefined, what3words: undefined, towerId: undefined, location: coords };
  const location = payload.location ?? coords;
  return {
    case: payload.case,
    locationText: `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}${payload.what3words ? ` / ${payload.what3words}` : ""}`,
    towerId: payload.towerId,
  };
}

function captureVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function waitForVideo(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 1200);
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });
}

function platformMessage(text: string) {
  return makeMessage("platform", text);
}

function makeMessage(sender: Message["sender"], text: string): Message {
  return {
    id: `${sender}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sender,
    text,
    timestamp: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }),
  };
}
