'use client';

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildVerificationReport } from "@/lib/kyc-report";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

type SecureSessionClientProps = {
  kycCase: WhatsAppKycCase;
  token: string;
};

export function SecureSessionClient({ kycCase, token }: SecureSessionClientProps) {
  const [sessionCase, setSessionCase] = useState(kycCase);
  const [deviceSaved, setDeviceSaved] = useState(false);
  const [locationSaved, setLocationSaved] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState("Capture home GPS location for informal settlement support.");
  const [affidavitSaved, setAffidavitSaved] = useState(false);
  const [idUpload, setIdUpload] = useState<{ fileName: string; documentType: string; confidence: number; extractedIdNumber?: string | null; matchedEnteredId?: boolean | null } | null>(null);
  const [proofDocumentType, setProofDocumentType] = useState("Bank statement");
  const [proofUpload, setProofUpload] = useState<{ fileName: string; documentType: string } | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(sessionCase.documentUrls.selfie ?? null);
  const [selfieState, setSelfieState] = useState<"idle" | "camera" | "analyzing" | "captured" | "error">("idle");
  const [selfieMessage, setSelfieMessage] = useState("Open the front camera to complete liveness and face match.");
  const [biometricResult, setBiometricResult] = useState<{ livenessScore: number; faceMatchScore: number; provider: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const verificationReport = buildVerificationReport(sessionCase);

  useEffect(() => {
    const payload = {
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

    void fetch(`/api/whatsapp/session/${encodeURIComponent(token)}/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) {
          setDeviceSaved(false);
          return;
        }
        const result = (await response.json()) as { case?: WhatsAppKycCase };
        if (result.case) setSessionCase(result.case);
        setDeviceSaved(true);
      })
      .catch(() => setDeviceSaved(false));
  }, [token]);

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

  async function refreshSessionCase() {
    const response = await fetch(`/api/whatsapp/session/${encodeURIComponent(token)}`);
    const payload = response.ok
      ? ((await response.json()) as { case?: WhatsAppKycCase })
      : { case: undefined };
    if (payload.case) setSessionCase(payload.case);
  }

  async function submitLocation(latitude: number, longitude: number, accuracy?: number) {
    const response = await fetch(`/api/whatsapp/session/${encodeURIComponent(token)}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, accuracy }),
    });
    const result = response.ok
      ? ((await response.json()) as { case?: WhatsAppKycCase; what3words?: string; error?: string })
      : { error: await response.text() };
    if (!response.ok) {
      setLocationMessage(result.error ?? "Unable to save GPS location.");
      return;
    }
    if (result.case) setSessionCase(result.case);
    setLocationSaved(result.what3words ?? "captured");
  }

  function captureLocation() {
    setLocationMessage("Requesting browser GPS permission...");
    if (!navigator.geolocation) {
      setLocationMessage("GPS is unavailable in this browser. Demo Sandton coordinates were saved.");
      void submitLocation(-26.1076, 28.0567, 10);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void submitLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      },
      () => {
        setLocationMessage("GPS permission was blocked. Demo Sandton coordinates were saved for the funder demo.");
        void submitLocation(-26.1076, 28.0567, 10);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  async function saveAffidavit() {
    const response = await fetch("/api/whatsapp/affidavit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: sessionCase.id,
        name: sessionCase.applicant.fullName ?? "Applicant",
        address: "15 Rivonia Road, Sandton",
        declarationAccepted: true,
        responses: [
          { question: "Do you confirm this is your primary home address?", answer: "Yes" },
          { question: "Do you lack a utility bill?", answer: "Yes" },
        ],
        affidavitText: "I confirm that I reside at the address above and do not have a formal proof of address.",
        videoUrl: "secure-session-affidavit-demo.mp4",
        imageUrl: "secure-session-affidavit-demo.png",
      }),
    });
    const result = (await response.json()) as { case?: WhatsAppKycCase };
    if (result.case) setSessionCase(result.case);
    setAffidavitSaved(response.ok);
  }

  async function uploadIdDocument(file: File | null, documentType: string) {
    if (!file) return;
    const documentUrl = await readFileAsDataUrl(file);
    const sessionToken = encodeURIComponent(token);
    const response = await fetch(`/api/whatsapp/session/${sessionToken}/document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentUrl,
        documentType,
        fileName: file.name,
      }),
    });
    const result = response.ok
      ? ((await response.json()) as {
          case?: WhatsAppKycCase;
          ocr?: { confidence: number; documentType: string; fileName: string; extractedIdNumber?: string | null; matchedEnteredId?: boolean | null };
        })
      : { case: undefined, ocr: undefined };
    if (result.case) setSessionCase(result.case);
    if (result.ocr) {
      setIdUpload({
        fileName: result.ocr.fileName,
        documentType: result.ocr.documentType,
        confidence: result.ocr.confidence,
        extractedIdNumber: result.ocr.extractedIdNumber ?? null,
        matchedEnteredId: result.ocr.matchedEnteredId ?? null,
      });
    }
  }

  async function uploadProofOfAddress(file: File | null) {
    if (!file) return;
    const proofOfAddressUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/whatsapp/address/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: sessionCase.id,
        proofOfAddressUrl,
        fileName: file.name,
        documentType: proofDocumentType,
      }),
    });
    const result = (await response.json()) as { case?: WhatsAppKycCase };
    if (result.case) setSessionCase(result.case);
    setProofUpload({ fileName: file.name, documentType: proofDocumentType });
  }

  async function completeChecks() {
    const response = await fetch("/api/whatsapp/risk-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: sessionCase.id }),
    });
    const result = (await response.json()) as { case?: WhatsAppKycCase };
    if (result.case) setSessionCase(result.case);
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSelfieState("error");
      setSelfieMessage("Camera capture is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setSelfieState("camera");
      setSelfieMessage("Camera is live. Center the customer face and capture the frame.");
    } catch {
      setSelfieState("error");
      setSelfieMessage("Camera permission was blocked or no camera is available.");
    }
  }

  async function captureSelfieAndAnalyze() {
    if (!videoRef.current) return;
    setSelfieState("analyzing");
    setSelfieMessage("Submitting selfie to the biometric verification endpoint...");
    await waitForVideo(videoRef.current);

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 720;
    canvas.height = videoRef.current.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) {
      setSelfieState("error");
      setSelfieMessage("Unable to capture a selfie frame from the camera.");
      return;
    }

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const selfieImage = canvas.toDataURL("image/jpeg", 0.82);
    setSelfiePreview(selfieImage);

    const response = await fetch("/api/whatsapp/biometrics/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: sessionCase.id,
        selfieUrl: selfieImage,
        idDocumentUrl: sessionCase.documentUrls.idDocument ?? "secure-session-id-demo.jpg",
      }),
    });

    const result = (await response.json()) as {
      provider?: string;
      livenessScore?: number;
      faceMatchScore?: number;
      case?: WhatsAppKycCase;
      error?: string;
    };

    if (!response.ok) {
      setSelfieState("error");
      setSelfieMessage(result.error ?? "Biometric verification failed.");
      return;
    }

    if (result.case) setSessionCase(result.case);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setBiometricResult({
      provider: result.provider ?? "mock",
      livenessScore: result.livenessScore ?? 0,
      faceMatchScore: result.faceMatchScore ?? 0,
    });
    setSelfieState("captured");
    setSelfieMessage("Selfie, liveness, and face match were recorded against the KYC case.");
  }

  return (
    <main className="min-h-screen bg-[#f3f8fc] px-4 py-8 text-[#12314a] lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f859b]">Secure verification session</p>
          <h1 className="mt-2 text-3xl font-semibold">WhatsApp KYC-Now secure handoff</h1>
          <p className="mt-3 text-sm leading-7 text-[#60778e]">
            Session reference: <span className="font-mono">{shortSessionReference(sessionCase.reference, token)}</span>
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoCard label="Reference" value={sessionCase.reference} />
            <InfoCard label="Status" value={sessionCase.status} />
            <InfoCard label="Applicant" value={sessionCase.applicant.fullName ?? "Pending name"} />
            <InfoCard label="Phone" value={sessionCase.applicant.phoneNumber ?? "Pending phone"} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="1. ID document and OCR"
            body={
              idUpload
                ? `${idUpload.documentType} saved from ${idUpload.fileName}. OCR confidence ${Math.round(idUpload.confidence * 100)}%; DHA validation is ready.`
                : "Upload a South African ID, driver's license, or passport before selfie matching."
            }
          >
            <div className="mt-4 grid gap-3">
              <select
                id="document-type"
                className="rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
                defaultValue="South African ID"
              >
                <option>South African ID</option>
                <option>Driver's license</option>
                <option>Passport</option>
              </select>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) =>
                  void uploadIdDocument(
                    event.target.files?.[0] ?? null,
                    (document.getElementById("document-type") as HTMLSelectElement | null)?.value ?? "South African ID"
                  )
                }
                className="text-sm text-[#536b82]"
              />
            </div>
          </Panel>
          <Panel
            title="2. Device intelligence"
            body={deviceSaved ? "Browser, screen, language, timezone, and session continuity captured." : "Capturing device context..."}
          />
          <Panel
            title="3. Selfie and liveness"
            body={
              biometricResult
                ? `Provider ${biometricResult.provider}: liveness ${Math.round(biometricResult.livenessScore * 100)}%, face match ${Math.round(biometricResult.faceMatchScore * 100)}%.`
                : selfieMessage
            }
            actionLabel={selfieState === "idle" || selfieState === "error" ? "Open camera" : undefined}
            onAction={selfieState === "idle" || selfieState === "error" ? openCamera : undefined}
          >
            {(selfieState === "camera" || selfieState === "analyzing") && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#d7e2ee] bg-[#0f2f3a]">
                <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
                <div className="flex gap-3 bg-white p-3">
                  <button
                    type="button"
                    onClick={() => void captureSelfieAndAnalyze()}
                    disabled={selfieState === "analyzing"}
                    className="rounded-full bg-[#0f2f3a] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#9cb0c2]"
                  >
                    {selfieState === "analyzing" ? "Analyzing..." : "Capture and verify"}
                  </button>
                </div>
              </div>
            )}
            {selfiePreview && selfieState === "captured" && (
              <img src={selfiePreview} alt="Captured selfie evidence" className="mt-4 aspect-square w-full rounded-2xl border border-[#d7e2ee] object-cover" />
            )}
          </Panel>
          <Panel
            title="4. Proof of address"
            body={
              proofUpload
                ? `${proofUpload.documentType} stored from ${proofUpload.fileName}.`
                : "Upload a bank statement, utility bill, municipal account, or service provider invoice."
            }
          >
            <div className="mt-4 grid gap-3">
              <select
                value={proofDocumentType}
                onChange={(event) => setProofDocumentType(event.target.value)}
                className="rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
              >
                <option>Bank statement</option>
                <option>Eskom or municipal electricity account</option>
                <option>Water and rates account</option>
                <option>Telkom or internet service provider invoice</option>
              </select>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => void uploadProofOfAddress(event.target.files?.[0] ?? null)}
                className="text-sm text-[#536b82]"
              />
            </div>
          </Panel>
          <Panel
            title="5. GPS and What3Words"
            body={locationSaved ? `Location captured as ${locationSaved}.` : locationMessage}
            actionLabel={locationSaved ? "Location saved" : "Capture location"}
            onAction={locationSaved ? undefined : captureLocation}
          />
          <Panel
            title="6. Digital affidavit fallback"
            body={affidavitSaved ? "Affidavit responses and video placeholder have been stored." : "Use this fallback when proof of address is not available."}
            actionLabel={affidavitSaved ? "Affidavit stored" : "Store affidavit"}
            onAction={affidavitSaved ? undefined : saveAffidavit}
          />
          <Panel
            title="7. Completed checks"
            body={
              sessionCase.risk
                ? `Completed. Decision ${sessionCase.risk.decision}, score ${sessionCase.risk.score}, status ${sessionCase.status}.`
                : "Run final checks after selfie, OTP, address or affidavit, and location are captured."
            }
            actionLabel={sessionCase.risk ? "Checks completed" : "Run final checks"}
            onAction={sessionCase.risk ? undefined : completeChecks}
          />
          {sessionCase.risk && (
            <section className="rounded-[1.75rem] border border-[#d7e2ee] bg-white p-5 shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Verification report</h2>
                  <p className="mt-2 text-sm text-[#60778e]">
                    Reference {verificationReport.reference} for {verificationReport.tenant}.
                  </p>
                </div>
                <a
                  href={`/api/whatsapp/cases/${sessionCase.id}/report?format=csv`}
                  className="rounded-full border border-[#d0dde9] bg-white px-4 py-2 text-sm font-semibold text-[#244661]"
                >
                  Download CSV
                </a>
              </div>

              <div className="mt-5 grid gap-3">
                {verificationReport.checks.map((check) => (
                  <div key={check.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#17324a]">{check.name}</p>
                      <p className="mt-1 text-sm text-[#60778e]">{check.detail}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${reportStatusTone(check.status)}`}>{check.status}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <InfoCard label="GPS" value={verificationReport.evidence.locationDescription} />
                <InfoCard label="IP address" value={verificationReport.evidence.ipAddress ?? "Not captured"} />
                <InfoCard label="ID OCR match" value={verificationReport.evidence.identityMatchedEnteredId === true ? "Matches entered ID" : verificationReport.evidence.identityMatchedEnteredId === false ? "Mismatch" : "Pending or unknown"} />
                <InfoCard label="Proof document" value={verificationReport.evidence.proofOfAddressDocumentType ?? "Not captured"} />
                <InfoCard label="Extracted ID" value={verificationReport.evidence.identityExtractedIdNumber ?? "Not captured"} />
                <InfoCard label="Affidavit ID" value={verificationReport.evidence.affidavitExtractedIdNumber ?? "Not captured"} />
              </div>

              <div className="mt-5 rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-[#8ba0b3]">Final decision</p>
                <p className="mt-2 text-xl font-semibold text-[#17324a]">
                  {verificationReport.decision} {verificationReport.score !== null ? `(${verificationReport.score})` : ""}
                </p>
                <p className="mt-2 text-sm text-[#60778e]">Simulation score: {verificationReport.simulation.score}/100 ({verificationReport.simulation.band}).</p>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  body,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[#d7e2ee] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[#60778e]">{body}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={!onAction}
          className="mt-5 rounded-full bg-[#0f2f3a] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#9cb0c2]"
        >
          {actionLabel}
        </button>
      )}
      {children}
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dde6ef] bg-[#f9fcff] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[#8ba0b3]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#17324a]">{value}</p>
    </div>
  );
}

function reportStatusTone(status: "DONE" | "PENDING" | "REVIEW") {
  if (status === "DONE") return "bg-[#d8f7df] text-[#177a36]";
  if (status === "REVIEW") return "bg-[#fff1c7] text-[#8a5b00]";
  return "bg-[#e8f0f6] text-[#536b82]";
}

function shortSessionReference(reference: string, token: string) {
  const suffix = token.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase();
  return `KYC-${reference.replace(/^WA-/, "")}-${suffix}`;
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
