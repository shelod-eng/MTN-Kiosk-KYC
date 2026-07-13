'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

const staffHeaders = {
  "Content-Type": "application/json",
  "x-staff-id": "ops-supervisor-001",
  "x-staff-name": "Nomsa Operations",
  "x-staff-role": "supervisor",
};

type InitiationForm = {
  tenant: "MTN" | "Vodacom" | "Cell C";
  customerPhoneNumber: string;
  deliveryMethod: "whatsapp" | "qr";
};

export function WhatsAppOpsConsole() {
  const [cases, setCases] = useState<WhatsAppKycCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<{
    persistence: string;
    providers: { otp: string; biometrics: string; what3words: string };
    supabaseConfigured: boolean;
  } | null>(null);
  const [form, setForm] = useState<InitiationForm>({
    tenant: "MTN",
    customerPhoneNumber: "+27785929455",
    deliveryMethod: "whatsapp",
  });

  async function loadCases() {
    setIsLoading(true);
    const response = await fetch("/api/whatsapp/cases", {
      headers: staffHeaders,
    });
    const payload = (await response.json()) as { cases?: WhatsAppKycCase[]; error?: string };
    setIsLoading(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load WhatsApp cases.");
      return;
    }
    setCases(payload.cases ?? []);
  }

  async function loadRuntimeStatus() {
    const response = await fetch("/api/whatsapp/runtime-status");
    const payload = (await response.json()) as {
      persistence: string;
      providers: { otp: string; biometrics: string; what3words: string };
      supabaseConfigured: boolean;
    };
    setRuntimeStatus(payload);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCases();
      void loadRuntimeStatus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function initiateCase() {
    setMessage(null);
    const response = await fetch("/api/whatsapp/staff/initiate", {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify(form),
    });
    const payload = (await response.json()) as { case?: WhatsAppKycCase; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to initiate WhatsApp case.");
      return;
    }
    setMessage(`Case ${payload.case?.reference ?? ""} initiated successfully.`);
    await loadCases();
  }

  async function stepCase(caseItem: WhatsAppKycCase, action: string) {
    const fullName = caseItem.applicant.fullName ?? "Lebo Mpeta";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || "Mpeta";

    if (action === "consent") {
      await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id, event: "consent_received" }),
      });
    }

    if (action === "details") {
      await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          event: "details_submitted",
          details: {
            fullName,
            idNumber: "9201055800087",
            phoneNumber: caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber,
            firstName,
            lastName,
          },
        }),
      });
    }

    if (action === "biometric") {
      await fetch("/api/whatsapp/biometrics/analyze", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          selfieUrl: "ops-console-selfie.jpg",
          idDocumentUrl: caseItem.documentUrls.idDocument ?? "ops-console-id.jpg",
        }),
      });
    }

    if (action === "otp-send") {
      await fetch("/api/whatsapp/otp/send", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id }),
      });
    }

    if (action === "otp-verify") {
      await fetch("/api/whatsapp/otp/verify", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id, code: "123456" }),
      });
    }

    if (action === "affidavit") {
      await fetch("/api/whatsapp/affidavit", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          name: fullName,
          address: "15 Rivonia Road, Sandton",
          declarationAccepted: true,
          responses: [
            { question: "Do you live at this address?", answer: "Yes" },
            { question: "Do you lack a utility bill?", answer: "Yes" },
          ],
          videoUrl: "ops-console-affidavit.mp4",
        }),
      });
    }

    if (action === "location") {
      await fetch("/api/whatsapp/location/resolve", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          latitude: -26.1076,
          longitude: 28.0567,
          accuracy: 12,
        }),
      });
    }

    if (action === "risk") {
      await fetch("/api/whatsapp/risk-score", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id }),
      });
    }

    await loadCases();
  }

  return (
    <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8ea6]">Operations console</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#112a43]">WhatsApp KYC-Now implementation console</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#657d94]">
            Use this console to initiate staff-assisted cases, advance the WhatsApp journey, and inspect secure-session links, OTP state, trust layers, and risk decisions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCases()}
          className="rounded-full border border-[#d0dde9] px-4 py-2 text-sm font-medium text-[#22435f]"
        >
          {isLoading ? "Refreshing..." : "Refresh cases"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[1.75rem] border border-[#dfe8f0] bg-[#f8fbfe] p-5">
          <h3 className="text-lg font-semibold text-[#17324a]">Initiate staff-assisted case</h3>
          <div className="mt-4 grid gap-4">
            <select
              value={form.tenant}
              onChange={(event) => setForm((current) => ({ ...current, tenant: event.target.value as InitiationForm["tenant"] }))}
              className="rounded-2xl border border-[#c8d6e3] bg-white px-4 py-3"
            >
              <option value="MTN">MTN</option>
              <option value="Vodacom">Vodacom</option>
              <option value="Cell C">Cell C</option>
            </select>
            <input
              value={form.customerPhoneNumber}
              onChange={(event) => setForm((current) => ({ ...current, customerPhoneNumber: event.target.value }))}
              className="rounded-2xl border border-[#c8d6e3] bg-white px-4 py-3"
              placeholder="+27..."
            />
            <select
              value={form.deliveryMethod}
              onChange={(event) =>
                setForm((current) => ({ ...current, deliveryMethod: event.target.value as InitiationForm["deliveryMethod"] }))
              }
              className="rounded-2xl border border-[#c8d6e3] bg-white px-4 py-3"
            >
              <option value="whatsapp">WhatsApp message</option>
              <option value="qr">QR handoff</option>
            </select>
            <button
              type="button"
              onClick={() => void initiateCase()}
              className="rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white"
            >
              Initiate case
            </button>
            {message && <p className="text-sm text-[#2f5f55]">{message}</p>}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-[#dfe8f0] bg-[#f8fbfe] p-5">
          <h3 className="text-lg font-semibold text-[#17324a]">Configured trust journey</h3>
          <ul className="mt-4 space-y-3 text-sm text-[#47647f]">
            <li>1. Staff initiation with role-based headers</li>
            <li>2. WhatsApp consent and minimal identity capture</li>
            <li>3. Secure web session for device, selfie, GPS, and affidavit fallback</li>
            <li>4. OTP send and verify before final approval</li>
            <li>5. Weighted trust-layer risk scoring into approve, review, or reject</li>
          </ul>
          {runtimeStatus && (
            <div className="mt-5 rounded-2xl border border-[#dbe6ef] bg-white px-4 py-3 text-sm text-[#4f6981]">
              Persistence: <span className="font-semibold text-[#18344d]">{runtimeStatus.persistence}</span>
              {" · "}
              OTP: <span className="font-semibold text-[#18344d]">{runtimeStatus.providers.otp}</span>
              {" · "}
              Biometrics: <span className="font-semibold text-[#18344d]">{runtimeStatus.providers.biometrics}</span>
              {" · "}
              What3Words: <span className="font-semibold text-[#18344d]">{runtimeStatus.providers.what3words}</span>
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-4">
        {cases.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-[#cdd9e4] bg-[#fbfdff] px-5 py-8 text-sm text-[#72879c]">
            No WhatsApp cases yet. Initiate one above to start the workflow.
          </div>
        ) : (
          cases.map((caseItem) => (
            <article key={caseItem.id} className="rounded-[1.75rem] border border-[#d7e2ee] bg-[#fbfdff] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-[#17324a]">{caseItem.reference}</p>
                  <p className="mt-1 text-sm text-[#697f95]">
                    {caseItem.tenant} · {caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber} · status: {caseItem.status}
                  </p>
                </div>
                <span className="rounded-full bg-[#e7f1fb] px-3 py-1 text-xs font-semibold text-[#24557d]">
                  {caseItem.risk?.decision ?? "Pending decision"}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Info label="Applicant" value={caseItem.applicant.fullName ?? "Not captured"} />
                <Info label="ID number" value={caseItem.applicant.idNumber ?? "Not captured"} />
                <Info label="OTP" value={caseItem.verification.otp?.status ?? "not started"} />
                <Info label="Liveness" value={caseItem.verification.livenessScore?.toFixed(2) ?? "not captured"} />
                <Info label="Face match" value={caseItem.verification.faceMatchScore?.toFixed(2) ?? "not captured"} />
                <Info label="What3Words" value={caseItem.geoCapture?.what3words ?? "not captured"} />
              </div>

              {caseItem.secureSessionToken && (
                <div className="mt-4 rounded-2xl border border-[#dbe6ef] bg-white px-4 py-3 text-sm text-[#546c83]">
                  Secure session:
                  {" "}
                  <Link href={`/verify/${caseItem.secureSessionToken}`} className="font-medium text-[#1f4b6d] underline">
                    /verify/{caseItem.secureSessionToken}
                  </Link>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <Action label="Consent" onClick={() => void stepCase(caseItem, "consent")} />
                <Action label="Details" onClick={() => void stepCase(caseItem, "details")} />
                <Action label="Biometrics" onClick={() => void stepCase(caseItem, "biometric")} />
                <Action label="Send OTP" onClick={() => void stepCase(caseItem, "otp-send")} />
                <Action label="Verify OTP" onClick={() => void stepCase(caseItem, "otp-verify")} />
                <Action label="Affidavit" onClick={() => void stepCase(caseItem, "affidavit")} />
                <Action label="Location" onClick={() => void stepCase(caseItem, "location")} />
                <Action label="Risk score" onClick={() => void stepCase(caseItem, "risk")} />
              </div>

              {caseItem.risk && (
                <div className="mt-5 rounded-2xl border border-[#dbe6ef] bg-white p-4">
                  <p className="text-sm font-semibold text-[#17324a]">
                    Risk score: {caseItem.risk.score} · {caseItem.risk.band} · {caseItem.risk.decision}
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {caseItem.risk.layers.map((layer) => (
                      <div key={layer.key} className="rounded-xl border border-[#edf2f6] bg-[#f8fbfe] px-3 py-2 text-sm text-[#597087]">
                        {layer.label}: {layer.status} ({layer.score})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[#d0dde9] bg-white px-4 py-2 text-sm font-medium text-[#284661]"
    >
      {label}
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dde6ef] bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[#8ba0b3]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#17324a]">{value}</p>
    </div>
  );
}
