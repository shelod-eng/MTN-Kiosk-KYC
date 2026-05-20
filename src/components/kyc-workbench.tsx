'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { BpmnBuilder } from "@/components/bpmn-builder";
import {
  computeDecision,
  createReference,
  deriveSignalsFromId,
  kioskJourneySteps,
  orchestrationStages,
  sampleCases,
  type Decision,
  type KycCase,
  type VerificationSignalSet,
} from "@/lib/mock-data";
import { validateSouthAfricanIdNumber } from "@/lib/sa-id";

type View = "dashboard" | "kiosk" | "whatsapp" | "review" | "workflow";

type PersonalDetails = {
  firstName: string;
  lastName: string;
  idNumber: string;
  phoneNumber: string;
  consent: boolean;
};

type UploadState = {
  idDocument: string | null;
  selfie: string | null;
  proofOfAddress: string | null;
};

type VerificationPhase = {
  key: string;
  label: string;
  state: "pending" | "running" | "done";
};

type KycRecord = {
  details: PersonalDetails;
  uploads: UploadState;
  reference: string;
  signals: VerificationSignalSet;
  decision: Decision;
  channel: "Kiosk" | "WhatsApp";
};

type OcrSummary = {
  fileName: string;
  confidence: number;
  headline: string;
  lines: string[];
};

const verificationBlueprint = [
  { key: "ocr", label: "ID OCR extraction" },
  { key: "liveness", label: "Selfie liveness and face match" },
  { key: "poa", label: "Proof of address validation" },
  { key: "dha", label: "DHA identity verification" },
  { key: "bureau", label: "TransUnion and Experian checks" },
  { key: "decision", label: "Risk decision" },
] satisfies Array<{ key: string; label: string }>;

const whatsappPrompts = [
  "START KYC",
  "AGREE",
  "SUBMIT DETAILS",
  "UPLOAD ID",
  "UPLOAD SELFIE",
  "UPLOAD POA",
] as const;

const emptyUploads: UploadState = {
  idDocument: null,
  selfie: null,
  proofOfAddress: null,
};

export function KycWorkbench() {
  const [view, setView] = useState<View>("whatsapp");
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<PersonalDetails>({
    firstName: "Lebo",
    lastName: "Mpeta",
    idNumber: "9201055800087",
    phoneNumber: "+27 78 592 9455",
    consent: true,
  });
  const [uploads, setUploads] = useState<UploadState>({
    idDocument: "sa-id-front.jpg",
    selfie: null,
    proofOfAddress: null,
  });
  const [kioskLivenessScore, setKioskLivenessScore] = useState<number | null>(null);
  const [verification, setVerification] = useState<VerificationPhase[]>(
    verificationBlueprint.map((phase) => ({ ...phase, state: "pending" }))
  );
  const [isRunningVerification, setIsRunningVerification] = useState(false);
  const [completedRecord, setCompletedRecord] = useState<KycRecord | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{ sender: "bot" | "client"; text: string }>>([
    { sender: "bot", text: 'Welcome to KYC-Now on WhatsApp. Reply "START KYC" to begin.' },
  ]);
  const [whatsAppStage, setWhatsAppStage] = useState(0);
  const [whatsAppUploads, setWhatsAppUploads] = useState<UploadState>({ ...emptyUploads });
  const [whatsAppRecord, setWhatsAppRecord] = useState<KycRecord | null>(null);
  const [whatsAppRunning, setWhatsAppRunning] = useState(false);
  const [whatsAppExpectedUpload, setWhatsAppExpectedUpload] = useState<"id" | "selfie" | "poa" | null>(null);
  const [whatsAppIdPreview, setWhatsAppIdPreview] = useState<string | null>(null);
  const [whatsAppPoaPreview, setWhatsAppPoaPreview] = useState<string | null>(null);
  const [whatsAppSelfiePreview, setWhatsAppSelfiePreview] = useState<string | null>(null);
  const [whatsAppIdOcr, setWhatsAppIdOcr] = useState<OcrSummary | null>(null);
  const [whatsAppPoaOcr, setWhatsAppPoaOcr] = useState<OcrSummary | null>(null);
  const [whatsAppOcrBusy, setWhatsAppOcrBusy] = useState<"id" | "poa" | null>(null);
  const idValidation = useMemo(() => validateSouthAfricanIdNumber(details.idNumber), [details.idNumber]);

  useEffect(() => {
    if (!isRunningVerification) return;
    const currentIndex = verification.findIndex((phase) => phase.state === "running");

    const timer = window.setTimeout(() => {
      if (currentIndex === -1) {
        const baseSignals = deriveSignalsFromId(details.idNumber);
        const signals = {
          ...baseSignals,
          liveness: kioskLivenessScore ?? baseSignals.liveness,
        };
        const decision = computeDecision(signals);
        setIsRunningVerification(false);
        setCompletedRecord({
          details,
          uploads,
          reference: createReference(),
          signals,
          decision,
          channel: "Kiosk",
        });
        return;
      }

      setVerification((current) =>
        current.map((phase, index) => {
          if (index < currentIndex) return phase;
          if (index === currentIndex) return { ...phase, state: "done" };
          if (index === currentIndex + 1) return { ...phase, state: "running" };
          return phase;
        })
      );
    }, 850);

    return () => window.clearTimeout(timer);
  }, [details, isRunningVerification, kioskLivenessScore, uploads, verification]);

  useEffect(() => {
    if (!whatsAppRunning) return;
    const timer = window.setTimeout(() => {
      const signals = deriveSignalsFromId(details.idNumber || "9201055800087");
      const decision = computeDecision(signals);
      const reference = createReference("WA");
      setChatMessages((current) => [
        ...current,
        { sender: "bot", text: "Your documents have been submitted. Running DHA and bureau checks now." },
        { sender: "bot", text: `KYC ${decision}. Reference number: ${reference}.` },
      ]);
      setWhatsAppRecord({
        details,
        uploads: whatsAppUploads,
        reference,
        signals,
        decision,
        channel: "WhatsApp",
      });
      setWhatsAppRunning(false);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [details, whatsAppRunning, whatsAppUploads]);

  const caseFeed = useMemo(() => {
    const runtimeCases: KycCase[] = [];

    if (completedRecord) {
      runtimeCases.unshift(recordToCase(completedRecord, completedRecord.details.firstName + " " + completedRecord.details.lastName));
    }

    if (whatsAppRecord) {
      runtimeCases.unshift(recordToCase(whatsAppRecord, whatsAppRecord.details.firstName + " " + whatsAppRecord.details.lastName));
    }

    return [...runtimeCases, ...sampleCases];
  }, [completedRecord, whatsAppRecord]);

  return (
    <main className="min-h-screen bg-[#eef4fb] text-[#0f2740]">
      <div className="border-b border-[#d7e2ee] bg-[#0f2f3a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 text-lg font-semibold">P</div>
            <div>
              <p className="text-2xl font-bold">Kiosk - KYC</p>
              <p className="text-sm text-slate-300">Identity Verification Demo</p>
            </div>
          </div>

          <nav className="hidden items-center gap-4 text-sm font-medium text-slate-200 md:flex">
            <button type="button" onClick={() => resetKioskDemo(setView, setStep, setCompletedRecord, setVerification, setIsRunningVerification, setKioskLivenessScore, setUploads)} className={navPill(view === "kiosk")}>
              Kiosk Demo
            </button>
            <button type="button" onClick={() => setView("whatsapp")} className={navPill(view === "whatsapp")}>
              WhatsApp Demo
            </button>
            <button type="button" onClick={() => setView("workflow")} className={navPill(view === "workflow")}>
              Workflow Builder
            </button>
            <button type="button" onClick={() => setView("review")} className={navTone(view === "review")}>
              Review Console
            </button>
          </nav>
        </div>
      </div>

      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        {view === "dashboard" && <FlowStrip onStart={() => setView("kiosk")} />}

        {view === "kiosk" && (
          <div className="mx-auto w-full max-w-4xl">
            <section className="rounded-[2rem] border border-[#d7e2ee] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#e5edf5] px-6 py-5">
                <button type="button" className="text-sm font-medium text-[#5d7289]" onClick={() => setView("whatsapp")}>
                  ← Switch to WhatsApp Demo
                </button>
                <div className="text-center">
                  <p className="text-xl font-semibold">Kiosk - KYC</p>
                </div>
                <p className="text-sm text-[#7b8ea6]">Step {step + 1} of {kioskJourneySteps.length}</p>
              </div>

              <div className="px-6 py-6">
                <StepRail currentStep={step} />
                <div className="mt-8 rounded-[1.75rem] border border-[#d7e2ee] bg-[#fbfdff]">
                  {step === 0 && <PersonalDetailsStep details={details} onChange={setDetails} />}
                  {step === 1 && (
                    <UploadStep
                      title="Upload ID Document"
                      description="Capture the applicant's SA ID, passport, or driver's licence."
                      fileLabel={uploads.idDocument}
                      buttonLabel="Attach ID document"
                      options={["SA ID Card", "Passport", "Driver's License"]}
                      helper="OCR will flag the case for manual review if confidence falls below 85%."
                      onFile={(name) => setUploads((current) => ({ ...current, idDocument: name }))}
                    />
                  )}
                  {step === 2 && (
                    <SelfieUploadStep
                      fileLabel={uploads.selfie}
                      score={kioskLivenessScore}
                      onFile={(file) => {
                        setUploads((current) => ({ ...current, selfie: file.name }));
                        setKioskLivenessScore(scoreUploadedSelfie(file.name));
                      }}
                    />
                  )}
                  {step === 3 && (
                    <UploadStep
                      title="Proof of Address"
                      description="Upload a utility bill or bank statement dated within the last 3 months."
                      fileLabel={uploads.proofOfAddress}
                      buttonLabel="Attach proof of address"
                      options={["Bank Statement", "Municipal Bill", "Telkom Invoice"]}
                      acceptedList={[
                        "Bank statement (not older than 3 months)",
                        "Eskom or municipal electricity account",
                        "Water and rates account",
                        "Telkom or internet service provider invoice",
                      ]}
                      helper="Address validation will request a re-upload if the document is too old or incomplete."
                      onFile={(name) => setUploads((current) => ({ ...current, proofOfAddress: name }))}
                    />
                  )}
                  {step === 4 && (
                    <VerificationStep
                      phases={verification}
                      isRunning={isRunningVerification}
                      result={completedRecord}
                      onRun={() => {
                        setCompletedRecord(null);
                        setVerification((current) =>
                          current.map((phase, index) => ({
                            ...phase,
                            state: index === 0 ? "running" : "pending",
                          }))
                        );
                        setIsRunningVerification(true);
                      }}
                    />
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    className="rounded-full border border-[#c9d8e6] px-5 py-3 text-sm font-medium text-[#486078] transition hover:bg-[#f0f5fa]"
                    onClick={() => setStep((current) => Math.max(0, current - 1))}
                    disabled={step === 0}
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    className="rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#164250] disabled:cursor-not-allowed disabled:bg-[#9cb0c2]"
                    onClick={() => setStep((current) => Math.min(kioskJourneySteps.length - 1, current + 1))}
                    disabled={!canAdvance(step, details, uploads, completedRecord, kioskLivenessScore)}
                  >
                    {step === kioskJourneySteps.length - 1 ? "Verification Complete" : "Continue"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {view === "workflow" && <BpmnBuilder />}

        {view === "whatsapp" && (
          <div className="mx-auto grid w-full max-w-5xl gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8ea6]">WhatsApp KYC-Now</p>
                  <h2 className="mt-2 text-2xl font-semibold">Client-guided identity and trust flow</h2>
                  <p className="mt-2 text-sm leading-6 text-[#698198]">
                    Staff initiates the case, the customer consents on WhatsApp, then secure web verification handles selfie, location, affidavit fallback, and OTP before final scoring.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    resetWhatsAppDemo(
                      setView,
                      setWhatsAppStage,
                      setChatMessages,
                      setWhatsAppUploads,
                      setWhatsAppRecord,
                      setWhatsAppRunning,
                      setWhatsAppExpectedUpload,
                      setWhatsAppIdPreview,
                      setWhatsAppPoaPreview,
                      setWhatsAppSelfiePreview,
                      setWhatsAppIdOcr,
                      setWhatsAppPoaOcr,
                      setWhatsAppOcrBusy
                    )
                  }
                  className="rounded-full border border-[#d0dde9] px-4 py-2 text-sm"
                >
                  Reset chat
                </button>
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-[#d7e2ee] bg-[#e6f6ec] p-4">
                <div className="space-y-3">
                  {chatMessages.map((message, index) => (
                    <div key={`${message.sender}-${index}`} className={`flex ${message.sender === "bot" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[80%] rounded-3xl px-4 py-3 text-sm leading-6 ${
                          message.sender === "bot" ? "bg-white text-[#19324a]" : "bg-[#0f2f3a] text-white"
                        }`}
                      >
                        {message.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {whatsappPrompts.map((prompt, index) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={index !== whatsAppStage || whatsAppRunning}
                    className="rounded-full border border-[#d0dde9] bg-[#f8fbfe] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => handleWhatsAppAction(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <StatusCard title="Captured case data">
                <div className="grid gap-4 md:grid-cols-2">
                  <MiniField label="Full name" value={`${details.firstName} ${details.lastName}`.trim() || "Not captured"} />
                  <MiniField label="ID number" value={details.idNumber || "Not captured"} />
                  <MiniField label="Phone" value={details.phoneNumber || "Not captured"} />
                  <MiniField label="Consent" value={details.consent ? "AGREE received" : "Pending"} />
                  <MiniField label="ID validation" value={idValidation.isValid ? "Valid SA ID" : "Needs correction"} />
                  <MiniField label="ID document" value={whatsAppUploads.idDocument ?? "Not uploaded"} />
                  <MiniField label="Selfie" value={whatsAppUploads.selfie ?? "Not uploaded"} />
                  <MiniField label="Proof of address" value={whatsAppUploads.proofOfAddress ?? "Not uploaded"} />
                </div>
              </StatusCard>

              <StatusCard title="Trust stack">
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    "Names",
                    "SA ID number",
                    "Liveness and face match",
                    "Proof of address or affidavit",
                    "OTP verification",
                    "Location and timestamp",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-[#dfe8f0] bg-[#f8fbfe] px-4 py-3 text-sm font-medium text-[#27445e]">
                      {item}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-[#667d93]">
                  Low risk cases auto-approve, medium risk routes to manual review, and high risk rejects or escalates.
                </p>
              </StatusCard>

              <StatusCard title="WhatsApp uploads">
                <div className="space-y-5">
                  <WhatsAppUploadCard
                    title="ID document upload"
                    subtitle="Upload the ID document sent through WhatsApp."
                    fileName={whatsAppUploads.idDocument}
                    preview={whatsAppIdPreview}
                    actionLabel="Upload ID document"
                    disabled={whatsAppExpectedUpload !== "id"}
                    busy={whatsAppOcrBusy === "id"}
                    onFile={(file) => handleWhatsAppFileUpload("id", file)}
                  />

                  <SelfieCaptureCard
                    disabled={whatsAppExpectedUpload !== "selfie"}
                    preview={whatsAppSelfiePreview}
                    fileName={whatsAppUploads.selfie}
                    onCapture={(dataUrl) => handleWhatsAppSelfieCapture(dataUrl)}
                  />

                  <WhatsAppUploadCard
                    title="Proof of address upload"
                    subtitle="Upload proof of address, or use the secure affidavit fallback when no bill is available."
                    fileName={whatsAppUploads.proofOfAddress}
                    preview={whatsAppPoaPreview}
                    actionLabel="Upload proof of address"
                    disabled={whatsAppExpectedUpload !== "poa"}
                    busy={whatsAppOcrBusy === "poa"}
                    onFile={(file) => handleWhatsAppFileUpload("poa", file)}
                  />
                </div>
              </StatusCard>

              <StatusCard title="OCR extraction">
                <div className="space-y-4">
                  <OcrResultCard title="ID OCR" summary={whatsAppIdOcr} emptyText="Upload the ID document to see extracted identity fields." />
                  <OcrResultCard title="Proof of address OCR" summary={whatsAppPoaOcr} emptyText="Upload proof of address to extract address details." />
                </div>
              </StatusCard>

              <StatusCard title="Outcome">
                {whatsAppRecord ? (
                  <ResultPanel record={whatsAppRecord} />
                ) : (
                  <p className="text-sm leading-6 text-[#64788f]">Complete the guided messages to receive the final KYC result.</p>
                )}
              </StatusCard>

              <StatusCard title="Secure web session">
                <p className="text-sm leading-6 text-[#64788f]">
                  The prototype now includes a dedicated secure session route at `/verify/[token]` for selfie capture, device intelligence, GPS capture, and affidavit fallback.
                </p>
              </StatusCard>

              <StatusCard title="Verification path">
                <div className="space-y-3">
                  {orchestrationStages.map((stage) => (
                    <div key={stage.key} className="rounded-2xl border border-[#dfe8f0] bg-[#f8fbfe] px-4 py-3">
                      <p className="text-sm font-semibold">{stage.label}</p>
                    </div>
                  ))}
                </div>
              </StatusCard>
            </section>
          </div>
        )}

        {view === "review" && (
          <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8ea6]">Analyst review console</p>
                <h2 className="mt-2 text-2xl font-semibold">Live case queue</h2>
              </div>
              <button type="button" onClick={() => resetKioskDemo(setView, setStep, setCompletedRecord, setVerification, setIsRunningVerification, setKioskLivenessScore, setUploads)} className="rounded-full border border-[#d0dde9] px-4 py-2 text-sm">
                Back to Kiosk Demo
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[#d7e2ee]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f5f9fc] text-[#4a6279]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Applicant</th>
                    <th className="px-4 py-3 font-semibold">Channel</th>
                    <th className="px-4 py-3 font-semibold">Signals</th>
                    <th className="px-4 py-3 font-semibold">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {caseFeed.map((item) => (
                    <tr key={`${item.reference}-${item.id}`} className="border-t border-[#e3ebf3] align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-[#0f2740]">{item.applicant}</p>
                        <p className="mt-1 font-mono text-xs text-[#6f869c]">{item.reference}</p>
                        <p className="mt-1 text-[#748aa0]">{item.tenant}</p>
                      </td>
                      <td className="px-4 py-4 text-[#597087]">
                        <p>{item.channel}</p>
                        <p className="mt-1">{item.updatedAt}</p>
                      </td>
                      <td className="px-4 py-4 text-[#597087]">
                        <p>DHA: {String(item.dhaVerified)}</p>
                        <p>OCR: {item.ocrConfidence}%</p>
                        <p>Liveness: {item.liveness}</p>
                        <p>TU: {item.transunionScore}</p>
                        <p>Experian: {item.experianBand}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionTone(item.decision)}`}>
                          {item.decision}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>
    </main>
  );

  function handleWhatsAppAction(prompt: (typeof whatsappPrompts)[number]) {
    setChatMessages((current) => [...current, { sender: "client", text: prompt }]);

    if (prompt === "START KYC") {
      setChatMessages((current) => [
        ...current,
        { sender: "client", text: prompt },
        { sender: "bot", text: "POPIA notice: reply AGREE to continue with KYC-Now identity verification." },
      ]);
      setWhatsAppStage(1);
      return;
    }

    if (prompt === "AGREE") {
      setDetails((current) => ({ ...current, consent: true }));
      setChatMessages((current) => [
        ...current,
        { sender: "client", text: prompt },
        { sender: "bot", text: "Consent captured. Please submit full name, SA ID number, and mobile number." },
      ]);
      setWhatsAppStage(2);
      return;
    }

    if (prompt === "SUBMIT DETAILS") {
      setChatMessages((current) => [
        ...current,
        {
          sender: "bot",
          text: `Captured ${details.firstName} ${details.lastName}, ${details.idNumber}. Please upload the client's ID document next.`,
        },
      ]);
      setWhatsAppStage(3);
      setWhatsAppExpectedUpload("id");
      return;
    }

    if (prompt === "UPLOAD ID") {
      setChatMessages((current) => [
        ...current,
        { sender: "bot", text: "Please attach the client's ID document below. OCR will extract identity fields before the secure selfie session." },
      ]);
      setWhatsAppExpectedUpload("id");
      return;
    }

    if (prompt === "UPLOAD SELFIE") {
      setChatMessages((current) => [
        ...current,
        { sender: "bot", text: "Open the secure camera session below and capture a selfie for liveness and face match." },
      ]);
      setWhatsAppExpectedUpload("selfie");
      return;
    }

    if (prompt === "UPLOAD POA") {
      setChatMessages((current) => [
        ...current,
        { sender: "bot", text: "Upload proof of address below, or use the affidavit fallback if the client does not have a bill available." },
      ]);
      setWhatsAppExpectedUpload("poa");
    }
  }

  async function handleWhatsAppFileUpload(kind: "id" | "poa", file: File) {
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;

    if (kind === "id") {
      if (whatsAppIdPreview) URL.revokeObjectURL(whatsAppIdPreview);
      setWhatsAppIdPreview(preview);
      setWhatsAppUploads((current) => ({ ...current, idDocument: file.name }));
      setWhatsAppOcrBusy("id");
      const summary = await mockOcrExtraction("id", file.name, details);
      setWhatsAppIdOcr(summary);
      setWhatsAppOcrBusy(null);
      setChatMessages((current) => [
        ...current,
        { sender: "client", text: `[Uploaded ID] ${file.name}` },
        { sender: "bot", text: `ID received. OCR extracted the holder details with ${summary.confidence}% confidence. Please continue to secure selfie capture next.` },
      ]);
      setWhatsAppExpectedUpload(null);
      setWhatsAppStage(4);
      return;
    }

    if (whatsAppPoaPreview) URL.revokeObjectURL(whatsAppPoaPreview);
    setWhatsAppPoaPreview(preview);
    setWhatsAppUploads((current) => ({ ...current, proofOfAddress: file.name }));
    setWhatsAppOcrBusy("poa");
    const summary = await mockOcrExtraction("poa", file.name, details);
    setWhatsAppPoaOcr(summary);
    setWhatsAppOcrBusy(null);
    setChatMessages((current) => [
      ...current,
      { sender: "client", text: `[Uploaded Proof of Address] ${file.name}` },
      { sender: "bot", text: `Proof of address received. OCR validated the address fields with ${summary.confidence}% confidence. OTP, location, and risk scoring are now ready.` },
    ]);
    setWhatsAppExpectedUpload(null);
    setWhatsAppStage(6);
    setWhatsAppRunning(true);
  }

  function handleWhatsAppSelfieCapture(dataUrl: string) {
    setWhatsAppSelfiePreview(dataUrl);
    setWhatsAppUploads((current) => ({ ...current, selfie: "whatsapp-selfie-capture.jpg" }));
    setChatMessages((current) => [
      ...current,
      { sender: "client", text: "[Captured Selfie] whatsapp-selfie-capture.jpg" },
      { sender: "bot", text: "Selfie received. Liveness capture complete. Please upload proof of address next, or continue with the affidavit fallback." },
    ]);
    setWhatsAppExpectedUpload(null);
    setWhatsAppStage(5);
  }
}

function FlowStrip({ onStart }: { onStart: () => void }) {
  return (
    <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8ea1b7]">KYC orchestration flow</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {[
              "01 Personal Details",
              "02 ID Upload + OCR",
              "03 Selfie + Liveness",
              "04 Proof of Address",
              "05 DHA Verification",
              "06 Bureau Checks",
              "07 Risk Decision",
            ].map((step) => (
              <span key={step} className="rounded-2xl bg-[#0f2f3a] px-4 py-3 text-sm font-semibold text-white">
                {step}
              </span>
            ))}
            <span className="rounded-2xl border border-[#b8efc3] bg-[#dcfce5] px-4 py-3 text-sm font-semibold text-[#15703d]">✓ APPROVE</span>
            <span className="rounded-2xl border border-[#fde090] bg-[#fff3c6] px-4 py-3 text-sm font-semibold text-[#9d6500]">⚑ REVIEW</span>
            <span className="rounded-2xl border border-[#f4c1c1] bg-[#ffe0e0] px-4 py-3 text-sm font-semibold text-[#be2323]">✕ REJECT</span>
          </div>
        </div>

        <button type="button" onClick={onStart} className="rounded-2xl bg-[#2f5f55] px-5 py-3 text-sm font-semibold text-white">
          Start Verification →
        </button>
      </div>
    </section>
  );
}

function StepRail({ currentStep }: { currentStep: number }) {
  return (
    <div className="rounded-[1.75rem] border border-[#d7e2ee] bg-white px-6 py-6">
      <div className="grid grid-cols-5 gap-3">
        {kioskJourneySteps.map((label, index) => (
          <div key={label} className="text-center">
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border text-sm font-semibold ${
                index <= currentStep
                  ? "border-[#0f2f3a] bg-[#0f2f3a] text-white"
                  : "border-[#d7e2ee] bg-[#f7fafc] text-[#a3b3c5]"
              }`}
            >
              {index + 1}
            </div>
            <p className={`mt-4 text-sm font-medium ${index === currentStep ? "text-[#112a43]" : "text-[#8ea1b7]"}`}>{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 h-2 rounded-full bg-[#edf2f6]">
        <div className="h-2 rounded-full bg-[#dfe8ef]" style={{ width: `${((currentStep + 1) / kioskJourneySteps.length) * 100}%` }} />
      </div>
    </div>
  );
}

function PersonalDetailsStep({
  details,
  onChange,
}: {
  details: PersonalDetails;
  onChange: React.Dispatch<React.SetStateAction<PersonalDetails>>;
}) {
  return (
    <div>
      <div className="rounded-t-[1.75rem] bg-[linear-gradient(135deg,#edf9f1,#f4f9ff)] px-6 py-6">
        <h2 className="text-3xl font-semibold text-[#112a43]">Personal Details</h2>
        <p className="mt-2 text-lg text-[#7c90a5]">Capture only the minimum details required for the WhatsApp KYC-Now flow.</p>
      </div>
      <div className="space-y-6 px-6 py-8">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="First Name" value={details.firstName} placeholder="e.g. Lebo" onChange={(value) => onChange((current) => ({ ...current, firstName: value }))} />
          <Field label="Last Name" value={details.lastName} placeholder="e.g. Mpeta" onChange={(value) => onChange((current) => ({ ...current, lastName: value }))} />
        </div>
        <Field label="SA ID Number" value={details.idNumber} placeholder="13-digit ID number" onChange={(value) => onChange((current) => ({ ...current, idNumber: value }))} />
        <Field label="Phone Number" value={details.phoneNumber} placeholder="+27 8X XXX XXXX" onChange={(value) => onChange((current) => ({ ...current, phoneNumber: value }))} />
        <label className="flex items-start gap-3 rounded-3xl border border-[#d6e4f2] bg-[#edf5ff] p-4">
          <input
            checked={details.consent}
            type="checkbox"
            className="mt-1 h-4 w-4"
            onChange={(event) => onChange((current) => ({ ...current, consent: event.target.checked }))}
          />
          <span className="text-base leading-8 text-[#2052d5]">
            <strong>POPIA Notice:</strong> Your data is collected solely for identity verification purposes and is encrypted with AES-256.
          </span>
        </label>
      </div>
    </div>
  );
}

function UploadStep({
  title,
  description,
  fileLabel,
  buttonLabel,
  options,
  acceptedList,
  helper,
  onFile,
}: {
  title: string;
  description: string;
  fileLabel: string | null;
  buttonLabel: string;
  options?: string[];
  acceptedList?: string[];
  helper: string;
  onFile: (name: string) => void;
}) {
  return (
    <div className="px-6 py-8">
      <h2 className="text-3xl font-semibold text-[#112a43]">{title}</h2>
      <p className="mt-3 text-lg leading-8 text-[#6c8298]">{description}</p>

      <div className="mt-8 rounded-[1.75rem] border border-dashed border-[#b9cadd] bg-[#f8fbfe] p-8 text-center">
        <p className="text-base text-[#6c8298]">{fileLabel ? `Selected: ${fileLabel}` : "No file attached yet."}</p>
        <label className="mt-5 inline-flex cursor-pointer rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white">
          {buttonLabel}
          <input
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file.name);
            }}
          />
        </label>
      </div>

      {options && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {options.map((option) => (
            <button key={option} type="button" className="rounded-2xl border border-[#d7e2ee] px-4 py-3 text-sm font-medium text-[#29445d]">
              {option}
            </button>
          ))}
        </div>
      )}

      {acceptedList && (
        <div className="mt-5 rounded-3xl border border-[#d7e2ee] bg-[#f8fbfe] p-4">
          <p className="font-semibold text-[#19344d]">Accepted Documents</p>
          <ul className="mt-3 space-y-2 text-sm text-[#32516c]">
            {acceptedList.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-sm leading-7 text-[#7f93a8]">{helper}</p>
    </div>
  );
}

function SelfieUploadStep({
  fileLabel,
  score,
  onFile,
}: {
  fileLabel: string | null;
  score: number | null;
  onFile: (file: File) => void;
}) {
  return (
    <div className="px-6 py-8">
      <h2 className="text-3xl font-semibold text-[#112a43]">Selfie + Liveness</h2>
      <p className="mt-3 text-lg leading-8 text-[#6c8298]">
        Upload a clear front-facing selfie. The demo will assign a liveness score and enforce the 0.75 pass threshold.
      </p>

      <div className="mt-8 rounded-[1.75rem] border border-dashed border-[#b9cadd] bg-[#f8fbfe] p-8 text-center">
        <p className="text-base text-[#6c8298]">{fileLabel ? `Selected: ${fileLabel}` : "No selfie uploaded yet."}</p>
        <label className="mt-5 inline-flex cursor-pointer rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white">
          Upload selfie
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {["Front Facing", "Well Lit", "No Obstruction"].map((option) => (
          <button key={option} type="button" className="rounded-2xl border border-[#d7e2ee] px-4 py-3 text-sm font-medium text-[#29445d]">
            {option}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-3xl border border-[#d7e2ee] bg-[#f8fbfe] p-4">
        <p className="font-semibold text-[#19344d]">Liveness result</p>
        <p className="mt-3 text-sm text-[#32516c]">
          {score === null
            ? "Upload a selfie to calculate the liveness score."
            : `Current liveness score: ${score.toFixed(2)} ${score >= 0.75 ? "(pass)" : "(fail - reupload required)"}`}
        </p>
      </div>

      <p className="mt-5 text-sm leading-7 text-[#7f93a8]">Cases fail automatically when liveness score drops below 0.75.</p>
    </div>
  );
}

function VerificationStep({
  phases,
  isRunning,
  result,
  onRun,
}: {
  phases: VerificationPhase[];
  isRunning: boolean;
  result: KycRecord | null;
  onRun: () => void;
}) {
  return (
    <div className="px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-[#112a43]">Verification</h2>
          <p className="mt-3 text-lg leading-8 text-[#6c8298]">
            Run the DHA, bureau, and rules engine checks for this KYC application.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="rounded-full bg-[#2f5f55] px-5 py-3 text-sm font-semibold text-white disabled:bg-[#9cb0c2]"
        >
          {isRunning ? "Running checks..." : "Run Verification"}
        </button>
      </div>

      <div className="mt-8 space-y-3">
        {phases.map((phase) => (
          <div key={phase.key} className="flex items-center justify-between rounded-3xl border border-[#dce7f0] bg-[#f8fbfe] px-4 py-4">
            <p className="font-medium text-[#112a43]">{phase.label}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${phaseTone(phase.state)}`}>{phase.state}</span>
          </div>
        ))}
      </div>

      {result && (
        <div className="mt-8">
          <ResultPanel record={result} />
        </div>
      )}
    </div>
  );
}

function ResultPanel({ record }: { record: KycRecord }) {
  return (
    <div className="rounded-[1.75rem] border border-[#d7e2ee] bg-[#f9fcff] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-[#758ba0]">Reference number</p>
          <p className="mt-1 font-mono text-lg font-semibold text-[#112a43]">{record.reference}</p>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${decisionTone(record.decision)}`}>{record.decision}</span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MiniField label="OCR confidence" value={`${record.signals.ocrConfidence}%`} />
        <MiniField label="Liveness" value={String(record.signals.liveness)} />
        <MiniField label="DHA verified" value={String(record.signals.dhaVerified)} />
        <MiniField label="TransUnion" value={String(record.signals.transunionScore)} />
        <MiniField label="Experian" value={record.signals.experianBand} />
      </div>
    </div>
  );
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-[#d7e2ee] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[#112a43]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function WhatsAppUploadCard({
  title,
  subtitle,
  fileName,
  preview,
  actionLabel,
  disabled,
  busy,
  onFile,
}: {
  title: string;
  subtitle: string;
  fileName: string | null;
  preview: string | null;
  actionLabel: string;
  disabled: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <div className={`rounded-3xl border p-4 ${disabled ? "border-[#e4ebf2] bg-[#f8fbfe] opacity-65" : "border-[#d7e2ee] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#17324a]">{title}</p>
          <p className="mt-1 text-sm text-[#6c8298]">{subtitle}</p>
        </div>
        {fileName && <span className="rounded-full bg-[#dcfce5] px-3 py-1 text-xs font-semibold text-[#15703d]">Uploaded</span>}
      </div>

      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={fileName ?? title} className="mt-4 h-40 w-full rounded-2xl border border-[#dce7f0] object-cover" />
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#cad6e3] bg-[#f8fbfe] px-4 py-8 text-center text-sm text-[#7b8ea6]">
          {fileName ?? "No file uploaded yet."}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-[#597087]">{fileName ?? "Awaiting upload"}</span>
        <label className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${disabled ? "cursor-not-allowed bg-[#b8c7d4]" : "cursor-pointer bg-[#0f2f3a]"}`}>
          {busy ? "Running OCR..." : actionLabel}
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function SelfieCaptureCard({
  disabled,
  preview,
  fileName,
  onCapture,
}: {
  disabled: boolean;
  preview: string | null;
  fileName: string | null;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(null);
      setCameraOn(true);
    } catch {
      setCameraError("Camera access was blocked. Allow camera permissions in the browser to capture a selfie.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }

  function capture() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
    stopCamera();
  }

  return (
    <div className={`rounded-3xl border p-4 ${disabled ? "border-[#e4ebf2] bg-[#f8fbfe] opacity-65" : "border-[#d7e2ee] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#17324a]">Selfie capture</p>
          <p className="mt-1 text-sm text-[#6c8298]">Open the front camera, capture the selfie, and attach it to the WhatsApp KYC case.</p>
        </div>
        {fileName && <span className="rounded-full bg-[#dcfce5] px-3 py-1 text-xs font-semibold text-[#15703d]">Captured</span>}
      </div>

      {cameraOn ? (
        <video ref={videoRef} autoPlay playsInline muted className="mt-4 h-56 w-full rounded-2xl border border-[#dce7f0] bg-black object-cover" />
      ) : preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selfie preview" className="mt-4 h-56 w-full rounded-2xl border border-[#dce7f0] object-cover" />
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#cad6e3] bg-[#f8fbfe] px-4 py-8 text-center text-sm text-[#7b8ea6]">
          {fileName ?? "No selfie captured yet."}
        </div>
      )}

      {cameraError && <p className="mt-3 text-sm text-[#be2323]">{cameraError}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {!cameraOn ? (
          <button type="button" disabled={disabled} onClick={startCamera} className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${disabled ? "cursor-not-allowed bg-[#b8c7d4]" : "bg-[#0f2f3a]"}`}>
            Turn Camera On
          </button>
        ) : (
          <>
            <button type="button" onClick={capture} className="rounded-full bg-[#2f5f55] px-4 py-2 text-sm font-semibold text-white">
              Take Selfie
            </button>
            <button type="button" onClick={stopCamera} className="rounded-full border border-[#d0dde9] px-4 py-2 text-sm font-semibold text-[#29445d]">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function OcrResultCard({
  title,
  summary,
  emptyText,
}: {
  title: string;
  summary: OcrSummary | null;
  emptyText: string;
}) {
  return (
    <div className="rounded-3xl border border-[#dfe8f0] bg-[#f8fbfe] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-[#17324a]">{title}</p>
        {summary && <span className="rounded-full bg-[#dceeff] px-3 py-1 text-xs font-semibold text-[#2052d5]">{summary.confidence}% confidence</span>}
      </div>
      {summary ? (
        <>
          <p className="mt-3 text-sm font-medium text-[#29445d]">{summary.headline}</p>
          <ul className="mt-3 space-y-2 text-sm text-[#597087]">
            {summary.lines.map((line) => (
              <li key={line}>- {line}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-[#6c8298]">{emptyText}</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-lg font-medium text-[#18324b]">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#c8d6e3] px-4 py-4 text-lg outline-none focus:border-[#53718f]"
      />
    </label>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dde6ef] bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[#8ba0b3]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#17324a]">{value}</p>
    </div>
  );
}

function phaseTone(state: "pending" | "running" | "done") {
  if (state === "done") return "bg-[#dcfce5] text-[#15703d]";
  if (state === "running") return "bg-[#dceeff] text-[#2052d5]";
  return "bg-[#eef3f7] text-[#6e8398]";
}

function decisionTone(decision: Decision) {
  if (decision === "APPROVE") return "bg-[#dcfce5] text-[#15703d]";
  if (decision === "REJECT") return "bg-[#ffe0e0] text-[#be2323]";
  return "bg-[#fff3c6] text-[#9d6500]";
}

function navTone(active: boolean) {
  return active ? "text-white" : "text-slate-300 transition hover:text-white";
}

function navPill(active: boolean) {
  return active
    ? "rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-white"
    : "rounded-2xl border border-transparent px-5 py-3 text-slate-300 transition hover:border-white/15 hover:text-white";
}

function scoreUploadedSelfie(fileName: string) {
  const base = 0.7 + ((fileName.length % 18) / 100);
  return Number(Math.min(0.95, base).toFixed(2));
}

function canAdvance(
  step: number,
  details: PersonalDetails,
  uploads: UploadState,
  completedRecord: KycRecord | null,
  kioskLivenessScore: number | null
) {
  if (step === 0) {
    return Boolean(
      details.firstName.trim() &&
        details.lastName.trim() &&
        /^\d{13}$/.test(details.idNumber.replace(/\D/g, "")) &&
        details.phoneNumber.trim() &&
        details.consent
    );
  }

  if (step === 1) return Boolean(uploads.idDocument);
  if (step === 2) return Boolean(uploads.selfie) && (kioskLivenessScore ?? 0) >= 0.75;
  if (step === 3) return Boolean(uploads.proofOfAddress);
  if (step === 4) return Boolean(completedRecord);
  return false;
}

function recordToCase(record: KycRecord, applicant: string): KycCase {
  return {
    id: record.reference,
    tenant: record.channel === "Kiosk" ? "MTN Kiosk" : "WhatsApp Channel",
    applicant,
    channel: record.channel,
    stage: record.decision === "REVIEW" ? "Manual review" : "Completed",
    dhaVerified: record.signals.dhaVerified,
    ocrConfidence: record.signals.ocrConfidence,
    liveness: record.signals.liveness,
    transunionScore: record.signals.transunionScore,
    experianBand: record.signals.experianBand,
    decision: record.decision,
    reference: record.reference,
    updatedAt: "just now",
  };
}

function resetKioskDemo(
  setView: React.Dispatch<React.SetStateAction<View>>,
  setStep: React.Dispatch<React.SetStateAction<number>>,
  setCompletedRecord: React.Dispatch<React.SetStateAction<KycRecord | null>>,
  setVerification: React.Dispatch<React.SetStateAction<VerificationPhase[]>>,
  setIsRunningVerification: React.Dispatch<React.SetStateAction<boolean>>,
  setKioskLivenessScore: React.Dispatch<React.SetStateAction<number | null>>,
  setUploads: React.Dispatch<React.SetStateAction<UploadState>>
) {
  setView("kiosk");
  setStep(0);
  setCompletedRecord(null);
  setIsRunningVerification(false);
  setKioskLivenessScore(null);
  setUploads({
    idDocument: "sa-id-front.jpg",
    selfie: null,
    proofOfAddress: null,
  });
  setVerification(verificationBlueprint.map((phase) => ({ ...phase, state: "pending" })));
}

function resetWhatsAppDemo(
  setView: React.Dispatch<React.SetStateAction<View>>,
  setWhatsAppStage: React.Dispatch<React.SetStateAction<number>>,
  setChatMessages: React.Dispatch<React.SetStateAction<Array<{ sender: "bot" | "client"; text: string }>>>,
  setWhatsAppUploads: React.Dispatch<React.SetStateAction<UploadState>>,
  setWhatsAppRecord: React.Dispatch<React.SetStateAction<KycRecord | null>>,
  setWhatsAppRunning: React.Dispatch<React.SetStateAction<boolean>>,
  setWhatsAppExpectedUpload: React.Dispatch<React.SetStateAction<"id" | "selfie" | "poa" | null>>,
  setWhatsAppIdPreview: React.Dispatch<React.SetStateAction<string | null>>,
  setWhatsAppPoaPreview: React.Dispatch<React.SetStateAction<string | null>>,
  setWhatsAppSelfiePreview: React.Dispatch<React.SetStateAction<string | null>>,
  setWhatsAppIdOcr: React.Dispatch<React.SetStateAction<OcrSummary | null>>,
  setWhatsAppPoaOcr: React.Dispatch<React.SetStateAction<OcrSummary | null>>,
  setWhatsAppOcrBusy: React.Dispatch<React.SetStateAction<"id" | "poa" | null>>
) {
  setView("whatsapp");
  setWhatsAppStage(0);
  setWhatsAppUploads({ ...emptyUploads });
  setWhatsAppRecord(null);
  setWhatsAppRunning(false);
  setWhatsAppExpectedUpload(null);
  setWhatsAppIdPreview(null);
  setWhatsAppPoaPreview(null);
  setWhatsAppSelfiePreview(null);
  setWhatsAppIdOcr(null);
  setWhatsAppPoaOcr(null);
  setWhatsAppOcrBusy(null);
  setChatMessages([{ sender: "bot", text: 'Welcome to KYC-Now on WhatsApp. Reply "START KYC" to begin.' }]);
}

async function mockOcrExtraction(kind: "id" | "poa", fileName: string, details: PersonalDetails) {
  await new Promise((resolve) => window.setTimeout(resolve, 1100));

  if (kind === "id") {
    const confidence = 86 + (fileName.length % 10);
    return {
      fileName,
      confidence,
      headline: "Identity fields extracted from uploaded document",
      lines: [
        `Name: ${details.firstName} ${details.lastName}`,
        `ID number: ${details.idNumber}`,
        `Document type: South African ID`,
        `Phone cross-reference: ${details.phoneNumber}`,
      ],
    } satisfies OcrSummary;
  }

  const confidence = 84 + (fileName.length % 12);
  return {
    fileName,
    confidence,
    headline: "Address fields extracted from proof of address",
    lines: [
      "Address: 15 Rivonia Road, Sandton",
      "Document age: 28 days old",
      "Issuer: Utility or financial statement",
      "Validation: Address usable for bureau checks",
    ],
  } satisfies OcrSummary;
}
