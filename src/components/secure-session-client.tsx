'use client';

import { useEffect, useState } from "react";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

type SecureSessionClientProps = {
  kycCase: WhatsAppKycCase;
  token: string;
};

export function SecureSessionClient({ kycCase, token }: SecureSessionClientProps) {
  const [deviceSaved, setDeviceSaved] = useState(false);
  const [locationSaved, setLocationSaved] = useState<string | null>(null);
  const [affidavitSaved, setAffidavitSaved] = useState(false);
  const [selfieState, setSelfieState] = useState<"idle" | "captured">("idle");

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

    void fetch(`/api/whatsapp/session/${token}/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(() => setDeviceSaved(true));
  }, [token]);

  function captureLocation() {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const response = await fetch(`/api/whatsapp/session/${token}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      });
      const result = (await response.json()) as { what3words?: string };
      setLocationSaved(result.what3words ?? "captured");
    });
  }

  async function saveAffidavit() {
    await fetch("/api/whatsapp/affidavit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: kycCase.id,
        name: kycCase.applicant.fullName ?? "Applicant",
        address: "15 Rivonia Road, Sandton",
        declarationAccepted: true,
        responses: [
          { question: "Do you confirm this is your primary home address?", answer: "Yes" },
          { question: "Do you lack a utility bill?", answer: "Yes" },
        ],
        videoUrl: "secure-session-affidavit-demo.mp4",
      }),
    });
    setAffidavitSaved(true);
  }

  async function markSelfieCaptured() {
    await fetch("/api/whatsapp/biometrics/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: kycCase.id,
        selfieUrl: "secure-session-selfie-demo.jpg",
        idDocumentUrl: kycCase.documentUrls.idDocument ?? "secure-session-id-demo.jpg",
      }),
    });
    setSelfieState("captured");
  }

  return (
    <main className="min-h-screen bg-[#f3f8fc] px-4 py-8 text-[#12314a] lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f859b]">Secure verification session</p>
          <h1 className="mt-2 text-3xl font-semibold">WhatsApp KYC-Now secure handoff</h1>
          <p className="mt-3 text-sm leading-7 text-[#60778e]">
            Session token: <span className="font-mono">{token}</span>
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoCard label="Reference" value={kycCase.reference} />
            <InfoCard label="Status" value={kycCase.status} />
            <InfoCard label="Applicant" value={kycCase.applicant.fullName ?? "Pending name"} />
            <InfoCard label="Phone" value={kycCase.applicant.phoneNumber ?? "Pending phone"} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="1. Device intelligence"
            body={deviceSaved ? "Browser, screen, language, timezone, and session continuity captured." : "Capturing device context..."}
          />
          <Panel
            title="2. Selfie and liveness"
            body={selfieState === "captured" ? "Demo selfie, liveness, and face match have been recorded." : "Record selfie and liveness result into the case."}
            actionLabel={selfieState === "captured" ? "Captured" : "Capture demo selfie"}
            onAction={selfieState === "captured" ? undefined : markSelfieCaptured}
          />
          <Panel
            title="3. GPS and What3Words"
            body={locationSaved ? `Location captured as ${locationSaved}.` : "Capture home GPS location for informal settlement support."}
            actionLabel={locationSaved ? "Location saved" : "Capture location"}
            onAction={locationSaved ? undefined : captureLocation}
          />
          <Panel
            title="4. Digital affidavit fallback"
            body={affidavitSaved ? "Affidavit responses and video placeholder have been stored." : "Use this fallback when proof of address is not available."}
            actionLabel={affidavitSaved ? "Affidavit stored" : "Store affidavit"}
            onAction={affidavitSaved ? undefined : saveAffidavit}
          />
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
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
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
