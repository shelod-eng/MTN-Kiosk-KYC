'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

const staffHeaders = {
  "Content-Type": "application/json",
  "x-staff-id": "store-agent-001",
  "x-staff-name": "Anele Store Agent",
  "x-staff-role": "supervisor",
};

type InitiationForm = {
  tenant: "MTN" | "Vodacom" | "Cell C";
  customerPhoneNumber: string;
  deliveryMethod: "whatsapp" | "qr";
};

type CustomerDetails = {
  fullName: string;
  idNumber: string;
  phoneNumber: string;
};

type RuntimeStatus = {
  persistence: string;
  providers: { otp: string; biometrics: string; what3words: string };
  supabaseConfigured: boolean;
};

export function StoreJourneySimulator() {
  const [form, setForm] = useState<InitiationForm>({
    tenant: "MTN",
    customerPhoneNumber: "+27785929455",
    deliveryMethod: "whatsapp",
  });
  const [customer, setCustomer] = useState<CustomerDetails>({
    fullName: "Lebo Mpeta",
    idNumber: "9201055800087",
    phoneNumber: "+27785929455",
  });
  const [caseItem, setCaseItem] = useState<WhatsAppKycCase | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<string[]>([
    "Store agent is ready to start a KYC-Now case for a walk-in customer.",
  ]);

  useEffect(() => {
    void fetch("/api/whatsapp/runtime-status")
      .then((response) => response.json())
      .then((payload: RuntimeStatus) => setRuntime(payload));
  }, []);

  const secureSessionLink = caseItem?.secureSessionToken ? `/verify/${caseItem.secureSessionToken}` : null;
  const trustSummary = useMemo(() => {
    if (!caseItem?.risk) return [];
    return caseItem.risk.layers.map((layer) => `${layer.label}: ${layer.status} (${layer.score})`);
  }, [caseItem]);

  async function refreshCase(caseId: string) {
    const response = await fetch(`/api/whatsapp/cases/${caseId}`, {
      headers: staffHeaders,
    });
    const payload = (await response.json()) as { case?: WhatsAppKycCase };
    if (payload.case) setCaseItem(payload.case);
  }

  async function runStep(key: string, task: () => Promise<void>) {
    setBusyKey(key);
    try {
      await task();
    } finally {
      setBusyKey(null);
    }
  }

  async function initiateCase() {
    await runStep("initiate", async () => {
      const response = await fetch("/api/whatsapp/staff/initiate", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { case?: WhatsAppKycCase; error?: string };
      if (payload.case) {
        setCaseItem(payload.case);
        setTimeline((current) => [
          ...current,
          `Store staff initiated ${payload.case.reference} for ${form.tenant} and sent a ${form.deliveryMethod === "qr" ? "QR handoff" : "WhatsApp message"}.`,
        ]);
      }
    });
  }

  async function sendConsent() {
    if (!caseItem) return;
    await runStep("consent", async () => {
      await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id, event: "consent_received" }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer accepted the POPIA notice inside WhatsApp."]);
    });
  }

  async function submitDetails() {
    if (!caseItem) return;
    await runStep("details", async () => {
      await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          event: "details_submitted",
          details: {
            fullName: customer.fullName,
            idNumber: customer.idNumber,
            phoneNumber: customer.phoneNumber,
          },
        }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer submitted full name, SA ID number, and mobile number."]);
    });
  }

  async function captureDevice() {
    if (!caseItem?.secureSessionToken) return;
    await runStep("device", async () => {
      await fetch(`/api/whatsapp/session/${caseItem.secureSessionToken}/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          browserFingerprint: "store-tablet-chrome-1080x1920-africa-johannesburg",
          operatingSystem: "Android 14",
          browser: "Chrome Mobile",
          screenSize: "1080x1920",
          timezone: "Africa/Johannesburg",
          language: "en-ZA",
          touchCapable: true,
          sessionContinuity: true,
          cookiesEnabled: true,
        }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Secure session captured device intelligence from the customer's handset or store tablet."]);
    });
  }

  async function runBiometrics() {
    if (!caseItem) return;
    await runStep("biometric", async () => {
      await fetch("/api/whatsapp/biometrics/analyze", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          selfieUrl: "customer-selfie.jpg",
          idDocumentUrl: "customer-id-front.jpg",
        }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer completed selfie, liveness detection, and face match against the ID document."]);
    });
  }

  async function sendOtp() {
    if (!caseItem) return;
    await runStep("otp-send", async () => {
      await fetch("/api/whatsapp/otp/send", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "System sent the OTP to the customer's mobile number."]);
    });
  }

  async function verifyOtp() {
    if (!caseItem) return;
    await runStep("otp-verify", async () => {
      await fetch("/api/whatsapp/otp/verify", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id, code: "123456" }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer entered the OTP and passed mobile verification."]);
    });
  }

  async function uploadProofOfAddress() {
    if (!caseItem) return;
    await runStep("poa", async () => {
      await fetch("/api/whatsapp/address/upload", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          proofOfAddressUrl: "utility-bill-may-2026.pdf",
          fileName: "utility-bill-may-2026.pdf",
        }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer provided proof of address through the secure handoff."]);
    });
  }

  async function useAffidavitFallback() {
    if (!caseItem) return;
    await runStep("affidavit", async () => {
      await fetch("/api/whatsapp/affidavit", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          name: customer.fullName,
          address: "15 Rivonia Road, Sandton",
          declarationAccepted: true,
          responses: [
            { question: "Do you confirm this is your home address?", answer: "Yes" },
            { question: "Do you have a utility bill with you?", answer: "No" },
          ],
        }),
      });
      await fetch("/api/whatsapp/affidavit/video", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          caseId: caseItem.id,
          videoUrl: "affidavit-affirmation.mp4",
        }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer used the affidavit fallback and recorded a short video affirmation."]);
    });
  }

  async function captureLocation() {
    if (!caseItem?.secureSessionToken) return;
    await runStep("location", async () => {
      await fetch(`/api/whatsapp/session/${caseItem.secureSessionToken}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: -26.1076,
          longitude: 28.0567,
          accuracy: 9.4,
        }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Customer shared live GPS coordinates and What3Words was resolved for the address context."]);
    });
  }

  async function computeRisk() {
    if (!caseItem) return;
    await runStep("risk", async () => {
      await fetch("/api/whatsapp/risk-score", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id }),
      });
      await refreshCase(caseItem.id);
      setTimeline((current) => [...current, "Risk engine evaluated the trust layers and produced the final decision."]);
    });
  }

  const actionDisabled = !caseItem;

  return (
    <main className="min-h-screen bg-[#f3f7fb] text-[#0f2740]">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="rounded-[2rem] border border-[#d7e2ee] bg-[linear-gradient(135deg,#0f2f3a,#19495a)] p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b9d3dd]">KYC-Now In-Store Flow</p>
          <h1 className="mt-2 text-3xl font-semibold">Customer-at-store WhatsApp KYC journey</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-[#d5e4ea]">
            This simulator follows the exact journey you asked for: staff initiation, WhatsApp consent and details, secure web handoff,
            selfie and liveness, OTP, proof of address or affidavit fallback, live location capture, and final weighted decisioning.
          </p>
          {runtime && (
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Badge label={`Persistence: ${runtime.persistence}`} />
              <Badge label={`OTP: ${runtime.providers.otp}`} />
              <Badge label={`Biometrics: ${runtime.providers.biometrics}`} />
              <Badge label={`What3Words: ${runtime.providers.what3words}`} />
            </div>
          )}
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="1. Store Staff Initiation" accent="store">
            <div className="grid gap-4">
              <SelectField
                label="Operator"
                value={form.tenant}
                options={["MTN", "Vodacom", "Cell C"]}
                onChange={(value) => setForm((current) => ({ ...current, tenant: value as InitiationForm["tenant"] }))}
              />
              <InputField
                label="Customer phone number"
                value={form.customerPhoneNumber}
                onChange={(value) => setForm((current) => ({ ...current, customerPhoneNumber: value }))}
              />
              <SelectField
                label="Delivery method"
                value={form.deliveryMethod}
                options={["whatsapp", "qr"]}
                onChange={(value) => setForm((current) => ({ ...current, deliveryMethod: value as InitiationForm["deliveryMethod"] }))}
              />
              <button
                type="button"
                onClick={() => void initiateCase()}
                className="rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white"
              >
                {busyKey === "initiate" ? "Starting case..." : "Start customer journey"}
              </button>
              {caseItem && (
                <div className="rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] px-4 py-3 text-sm text-[#4d677f]">
                  Case created: <span className="font-semibold text-[#18344d]">{caseItem.reference}</span>
                  {" · "}
                  status: <span className="font-semibold text-[#18344d]">{caseItem.status}</span>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="2. Customer WhatsApp Conversation" accent="chat">
            <div className="rounded-[1.5rem] border border-[#d7e2ee] bg-[#e9f7ef] p-4">
              <div className="space-y-3">
                {timeline.slice(-6).map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-[#18344d]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              <button
                type="button"
                disabled={actionDisabled || busyKey !== null}
                onClick={() => void sendConsent()}
                className="rounded-full border border-[#d0dde9] bg-white px-4 py-3 text-sm font-semibold text-[#244661] disabled:opacity-45"
              >
                Customer agrees to consent
              </button>
              <div className="grid gap-4 md:grid-cols-3">
                <InputField label="Full name" value={customer.fullName} onChange={(value) => setCustomer((current) => ({ ...current, fullName: value }))} />
                <InputField label="SA ID number" value={customer.idNumber} onChange={(value) => setCustomer((current) => ({ ...current, idNumber: value }))} />
                <InputField label="Phone number" value={customer.phoneNumber} onChange={(value) => setCustomer((current) => ({ ...current, phoneNumber: value }))} />
              </div>
              <button
                type="button"
                disabled={actionDisabled || busyKey !== null}
                onClick={() => void submitDetails()}
                className="rounded-full border border-[#d0dde9] bg-white px-4 py-3 text-sm font-semibold text-[#244661] disabled:opacity-45"
              >
                Submit customer details from WhatsApp
              </button>
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel title="3. Secure Web Handoff" accent="secure">
            <div className="grid gap-4">
              {secureSessionLink ? (
                <div className="rounded-[1.5rem] border border-[#d7e2ee] bg-[#f8fbfe] p-4">
                  <p className="text-sm text-[#536b82]">Signed customer session created.</p>
                  <Link href={secureSessionLink} className="mt-2 inline-block text-sm font-semibold text-[#1f4b6d] underline">
                    Open secure verification session
                  </Link>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[#cfdbe6] bg-[#fbfdff] p-4 text-sm text-[#72879c]">
                  Start the case first to generate the secure session handoff.
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <ActionCard
                  title="Device intelligence"
                  description="Capture browser fingerprint, OS, screen size, timezone, cookies, and touch capability."
                  buttonLabel={busyKey === "device" ? "Capturing..." : "Capture device context"}
                  onClick={() => void captureDevice()}
                  disabled={!secureSessionLink || busyKey !== null}
                />
                <ActionCard
                  title="Selfie and liveness"
                  description="Run guided selfie capture with liveness and face match against the uploaded ID."
                  buttonLabel={busyKey === "biometric" ? "Running..." : "Run biometrics"}
                  onClick={() => void runBiometrics()}
                  disabled={actionDisabled || busyKey !== null}
                />
                <ActionCard
                  title="OTP verification"
                  description="Send OTP to the customer number and verify it before allowing approval."
                  buttonLabel={busyKey === "otp-send" ? "Sending..." : "Send OTP"}
                  secondaryLabel={busyKey === "otp-verify" ? "Verifying..." : "Verify OTP"}
                  onClick={() => void sendOtp()}
                  onSecondaryClick={() => void verifyOtp()}
                  disabled={actionDisabled || busyKey !== null}
                />
                <ActionCard
                  title="Location capture"
                  description="Customer answers 'Yes, I am home' and shares GPS coordinates for What3Words resolution."
                  buttonLabel={busyKey === "location" ? "Capturing..." : "Capture location"}
                  onClick={() => void captureLocation()}
                  disabled={!secureSessionLink || busyKey !== null}
                />
              </div>
            </div>
          </Panel>

          <Panel title="4. Address and Affidavit" accent="address">
            <div className="grid gap-3">
              <ActionCard
                title="Proof of address"
                description="Simulate the customer uploading a utility bill or bank statement."
                buttonLabel={busyKey === "poa" ? "Uploading..." : "Use proof of address"}
                onClick={() => void uploadProofOfAddress()}
                disabled={actionDisabled || busyKey !== null}
              />
              <ActionCard
                title="Digital affidavit fallback"
                description="Use the fallback flow with structured Q&A and a short affirmation video."
                buttonLabel={busyKey === "affidavit" ? "Saving..." : "Use affidavit fallback"}
                onClick={() => void useAffidavitFallback()}
                disabled={actionDisabled || busyKey !== null}
              />
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="5. Decision and Review Outcome" accent="decision">
            <button
              type="button"
              disabled={actionDisabled || busyKey !== null}
              onClick={() => void computeRisk()}
              className="rounded-full bg-[#2f5f55] px-5 py-3 text-sm font-semibold text-white disabled:opacity-45"
            >
              {busyKey === "risk" ? "Computing..." : "Compute final risk decision"}
            </button>

            {caseItem ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InfoCard label="Case reference" value={caseItem.reference} />
                <InfoCard label="Current flow state" value={caseItem.status} />
                <InfoCard label="Customer" value={caseItem.applicant.fullName ?? "Pending"} />
                <InfoCard label="Phone" value={caseItem.applicant.phoneNumber ?? "Pending"} />
                <InfoCard label="OTP" value={caseItem.verification.otp?.status ?? "Pending"} />
                <InfoCard label="What3Words" value={caseItem.geoCapture?.what3words ?? "Pending"} />
              </div>
            ) : null}
          </Panel>

          <Panel title="6. Trust Layers and Final Recommendation" accent="risk">
            {caseItem?.risk ? (
              <>
                <div className="flex flex-wrap gap-3">
                  <Badge label={`Score ${caseItem.risk.score}`} />
                  <Badge label={`Band ${caseItem.risk.band}`} />
                  <Badge label={`Decision ${caseItem.risk.decision}`} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {trustSummary.map((item) => (
                    <div key={item} className="rounded-2xl border border-[#dfe8f0] bg-[#f8fbfe] px-4 py-3 text-sm text-[#27445e]">
                      {item}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-[#677f95]">
                Run the full customer journey, then compute the risk score to see whether the case auto-approves, routes to manual review, or rejects.
              </p>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "store" | "chat" | "secure" | "address" | "decision" | "risk";
  children: React.ReactNode;
}) {
  const tone: Record<typeof accent, string> = {
    store: "border-[#d7e2ee] bg-white",
    chat: "border-[#d7e2ee] bg-white",
    secure: "border-[#d7e2ee] bg-white",
    address: "border-[#d7e2ee] bg-white",
    decision: "border-[#d7e2ee] bg-white",
    risk: "border-[#d7e2ee] bg-white",
  };

  return (
    <section className={`rounded-[2rem] border p-6 shadow-sm ${tone[accent]}`}>
      <h2 className="text-xl font-semibold text-[#112a43]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#26445f]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#26445f]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionCard({
  title,
  description,
  buttonLabel,
  secondaryLabel,
  onClick,
  onSecondaryClick,
  disabled,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  secondaryLabel?: string;
  onClick: () => void;
  onSecondaryClick?: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[#dfe8f0] bg-[#f8fbfe] p-4">
      <p className="font-semibold text-[#17324a]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#667d93]">{description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="rounded-full bg-[#0f2f3a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
        >
          {buttonLabel}
        </button>
        {secondaryLabel && onSecondaryClick && (
          <button
            type="button"
            onClick={onSecondaryClick}
            disabled={disabled}
            className="rounded-full border border-[#d0dde9] bg-white px-4 py-2 text-sm font-semibold text-[#244661] disabled:opacity-45"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{label}</span>;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dde6ef] bg-[#f9fcff] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[#8ba0b3]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#17324a]">{value}</p>
    </div>
  );
}
