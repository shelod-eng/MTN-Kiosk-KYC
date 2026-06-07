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

type NetworkProvider = "MTN" | "Vodacom" | "Cell C";
type RouteMode = "single" | "bulk";

type CustomerDetails = {
  fullName: string;
  idNumber: string;
  phoneNumber: string;
};

type BulkCampaignBatch = {
  batchId: string;
  batchReference: string;
  provider: NetworkProvider;
  sourceFileName: string;
  status: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  cases: WhatsAppKycCase[];
  errors: Array<{ rowNumber: number; message: string }>;
  providerReport: string;
};

type RuntimeStatus = {
  persistence: string;
  providers: { otp: string; biometrics: string; what3words: string };
  supabaseConfigured: boolean;
};

export function StoreJourneySimulator() {
  const [routeMode, setRouteMode] = useState<RouteMode>("single");
  const [provider, setProvider] = useState<NetworkProvider>("MTN");
  const [customer, setCustomer] = useState<CustomerDetails>({
    fullName: "Lebo Mpeta",
    idNumber: "9201055800087",
    phoneNumber: "+27785929455",
  });
  const [campaignCsv, setCampaignCsv] = useState(
    'fullName,idNumber,phoneNumber,towerId,locationEvidence\nNomsa Dlamini,8801015800082,+27821234567,MTN_TWR_045,"GPS:-26.2041,28.0473"\nThabo Molefe,9002025800088,+27731234567,VOD_TWR_112,"Affidavit: Informal Settlement Zone 7"\nAyanda Khumalo,9503035800089,+27611234567,CELL_TWR_221,"GPS:-26.3456,28.1234"'
  );
  const [campaignFileName, setCampaignFileName] = useState("provider-daily-rica-file.csv");
  const [caseItem, setCaseItem] = useState<WhatsAppKycCase | null>(null);
  const [campaignCases, setCampaignCases] = useState<WhatsAppKycCase[]>([]);
  const [campaignBatch, setCampaignBatch] = useState<BulkCampaignBatch | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ sender: "platform" | "customer"; text: string }>>([
    { sender: "platform", text: "Store agent selects a network and sends a WhatsApp KYC message to the customer." },
  ]);

  useEffect(() => {
    void fetch("/api/whatsapp/runtime-status")
      .then((response) => response.json())
      .then((payload: RuntimeStatus) => setRuntime(payload));
  }, []);

  const secureSessionLink = caseItem?.secureSessionToken ? `/verify/${caseItem.secureSessionToken}` : null;
  const nextStep = useMemo(() => getNextStep(caseItem), [caseItem]);

  async function runStep(key: string, task: () => Promise<void>) {
    setBusyKey(key);
    try {
      await task();
    } finally {
      setBusyKey(null);
    }
  }

  async function refreshCase(caseId = caseItem?.id) {
    if (!caseId) return;
    const response = await fetch(`/api/whatsapp/cases/${caseId}`, { headers: staffHeaders });
    const payload = (await response.json()) as { case?: WhatsAppKycCase };
    if (payload.case) setCaseItem(payload.case);
  }

  async function sendWalkInInvite() {
    await runStep("invite", async () => {
      const response = await fetch("/api/whatsapp/staff/initiate", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          tenant: provider,
          customerPhoneNumber: customer.phoneNumber,
          deliveryMethod: "whatsapp",
          notes: "Single walk-in KYC initiated at store kiosk",
        }),
      });
      const payload = (await response.json()) as { case?: WhatsAppKycCase; error?: string };
      if (!payload.case) return;

      setCaseItem(payload.case);
      setMessages([
        { sender: "platform", text: `${provider} staff sent a WhatsApp KYC message to ${customer.phoneNumber}.` },
        { sender: "platform", text: 'Welcome to KYC-Now. Reply "START KYC" to begin your FICA/RICA registration.' },
      ]);
    });
  }

  async function acceptConsent() {
    if (!caseItem) return;
    await runStep("consent", async () => {
      await fetch("/api/whatsapp/webhook", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id, event: "consent_received" }),
      });
      await refreshCase(caseItem.id);
      setMessages((current) => [
        ...current,
        { sender: "customer", text: "START KYC" },
        { sender: "customer", text: "AGREE" },
        { sender: "platform", text: "Consent captured. Please submit your full name, SA ID number, and mobile number." },
      ]);
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
          details: customer,
        }),
      });
      await refreshCase(caseItem.id);
      setMessages((current) => [
        ...current,
        { sender: "customer", text: `${customer.fullName}, ${customer.idNumber}, ${customer.phoneNumber}` },
        { sender: "platform", text: "Details captured. Open the secure link to complete selfie, liveness, device, and location checks." },
      ]);
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
      setMessages((current) => [...current, { sender: "platform", text: "OTP sent on WhatsApp/SMS. Demo code is 123456." }]);
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
      setMessages((current) => [...current, { sender: "customer", text: "123456" }, { sender: "platform", text: "OTP verified. Please provide proof of address or complete the affidavit fallback." }]);
    });
  }

  async function submitAddress(useAffidavit: boolean) {
    if (!caseItem) return;
    await runStep(useAffidavit ? "affidavit" : "poa", async () => {
      if (useAffidavit) {
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
              { question: "Do you have a utility bill?", answer: "No" },
            ],
          }),
        });
      } else {
        await fetch("/api/whatsapp/address/upload", {
          method: "POST",
          headers: staffHeaders,
          body: JSON.stringify({
            caseId: caseItem.id,
            proofOfAddressUrl: "utility-bill-may-2026.pdf",
            fileName: "utility-bill-may-2026.pdf",
          }),
        });
      }
      await refreshCase(caseItem.id);
      setMessages((current) => [
        ...current,
        { sender: "customer", text: useAffidavit ? "I confirm my address by affidavit." : "Uploaded proof of address." },
        { sender: "platform", text: "Address evidence captured. Please share your live location." },
      ]);
    });
  }

  async function captureLocation() {
    if (!caseItem?.secureSessionToken) return;
    await runStep("location", async () => {
      const sessionToken = encodeURIComponent(caseItem.secureSessionToken);
      await fetch(`/api/whatsapp/session/${sessionToken}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: -26.1076, longitude: 28.0567, accuracy: 9.4 }),
      });
      await refreshCase(caseItem.id);
      setMessages((current) => [...current, { sender: "customer", text: "Shared live location." }, { sender: "platform", text: "Location captured. Final risk decision can now be calculated." }]);
    });
  }

  async function computeRisk() {
    if (!caseItem) return;
    await runStep("risk", async () => {
      const response = await fetch("/api/whatsapp/risk-score", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({ caseId: caseItem.id }),
      });
      const payload = (await response.json()) as { case?: WhatsAppKycCase };
      if (payload.case) setCaseItem(payload.case);
      setMessages((current) => [...current, { sender: "platform", text: "KYC checks completed. Final decision is ready for the provider." }]);
    });
  }

  async function sendCampaign() {
    await runStep("campaign", async () => {
      setCampaignError(null);
      const response = await fetch("/api/whatsapp/bulk-campaigns", {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          provider,
          csv: campaignCsv,
          source: "upload",
          sourceFileName: campaignFileName,
        }),
      });
      const payload = (await response.json()) as { batch?: BulkCampaignBatch; error?: string };
      if (!response.ok || !payload.batch) {
        setCampaignError(payload.error ?? "Bulk campaign ingestion failed.");
        return;
      }
      setCampaignBatch(payload.batch);
      setCampaignCases(payload.batch.cases);
    });
  }

  async function loadCampaignFile(file: File | null) {
    if (!file) return;
    setCampaignFileName(file.name);
    setCampaignCsv(await file.text());
  }

  function downloadProviderReport() {
    if (!campaignBatch) return;
    const blob = new Blob([campaignBatch.providerReport], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaignBatch.batchReference}-provider-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#eef4fb] text-[#0f2740]">
      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="rounded-3xl border border-[#d7e2ee] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f859b]">KYC-Now WhatsApp FICA/RICA</p>
              <h1 className="mt-2 text-2xl font-semibold text-[#0f2f3a]">Network provider customer registration</h1>
            </div>
            {runtime && (
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#315069]">
                <Badge label={`OTP ${runtime.providers.otp}`} />
                <Badge label={`Biometrics ${runtime.providers.biometrics}`} />
                <Badge label={`Location ${runtime.providers.what3words}`} />
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-2 sm:grid-cols-2">
            <button type="button" onClick={() => setRouteMode("single")} className={modeButton(routeMode === "single")}>
              Single walk-in WhatsApp
            </button>
            <button type="button" onClick={() => setRouteMode("bulk")} className={modeButton(routeMode === "bulk")}>
              Bulk campaign CSV
            </button>
          </div>
        </header>

        {routeMode === "single" ? (
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Store initiation">
              <div className="grid gap-4">
                <SelectField label="Network provider" value={provider} options={["MTN", "Vodacom", "Cell C"]} onChange={(value) => setProvider(value as NetworkProvider)} />
                <InputField label="Customer WhatsApp number" value={customer.phoneNumber} onChange={(value) => setCustomer((current) => ({ ...current, phoneNumber: value }))} />
                <button type="button" onClick={() => void sendWalkInInvite()} className="rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white">
                  {busyKey === "invite" ? "Sending..." : "Send WhatsApp KYC"}
                </button>
                {caseItem && <CaseSummary kycCase={caseItem} />}
              </div>
            </Panel>

            <Panel title="Customer WhatsApp journey">
              <div className="rounded-[1.5rem] border border-[#cfe1d8] bg-[#e7f6ec] p-4">
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <div key={`${message.text}-${index}`} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender === "customer" ? "ml-auto bg-[#0f2f3a] text-white" : "bg-white text-[#18344d]"}`}>
                      {message.text}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {caseItem?.status === "consent_pending" && (
                  <button type="button" onClick={() => void acceptConsent()} className="primary-action">
                    {busyKey === "consent" ? "Capturing..." : "Customer replies START KYC and AGREE"}
                  </button>
                )}

                {caseItem?.status === "details_pending" && (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <InputField label="Full name" value={customer.fullName} onChange={(value) => setCustomer((current) => ({ ...current, fullName: value }))} />
                      <InputField label="SA ID number" value={customer.idNumber} onChange={(value) => setCustomer((current) => ({ ...current, idNumber: value }))} />
                      <InputField label="Mobile number" value={customer.phoneNumber} onChange={(value) => setCustomer((current) => ({ ...current, phoneNumber: value }))} />
                    </div>
                    <button type="button" onClick={() => void submitDetails()} className="primary-action">
                      {busyKey === "details" ? "Submitting..." : "Submit WhatsApp details"}
                    </button>
                  </>
                )}

                {caseItem?.status === "selfie_pending" && secureSessionLink && (
                  <div className="grid gap-3 rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-4">
                    <Link href={secureSessionLink} className="primary-action text-center">
                      Open secure camera session
                    </Link>
                    <button type="button" onClick={() => void refreshCase()} className="secondary-action">
                      Refresh after selfie capture
                    </button>
                  </div>
                )}

                {caseItem?.status === "otp_pending" && (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => void sendOtp()} className="primary-action">
                      {busyKey === "otp-send" ? "Sending..." : "Send OTP"}
                    </button>
                    <button type="button" onClick={() => void verifyOtp()} className="secondary-action">
                      {busyKey === "otp-verify" ? "Verifying..." : "Verify OTP"}
                    </button>
                  </div>
                )}

                {caseItem?.status === "address_pending" && (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => void submitAddress(false)} className="primary-action">
                      Use proof of address
                    </button>
                    <button type="button" onClick={() => void submitAddress(true)} className="secondary-action">
                      Use affidavit fallback
                    </button>
                  </div>
                )}

                {caseItem?.status === "location_pending" && (
                  <button type="button" onClick={() => void captureLocation()} className="primary-action">
                    {busyKey === "location" ? "Capturing..." : "Share location"}
                  </button>
                )}

                {caseItem?.status === "risk_review" && (
                  <button type="button" onClick={() => void computeRisk()} className="primary-action">
                    {busyKey === "risk" ? "Scoring..." : "Complete KYC decision"}
                  </button>
                )}

                {caseItem?.risk && (
                  <div className="rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-4 text-sm text-[#284761]">
                    Decision: <span className="font-semibold">{caseItem.risk.decision}</span> with score <span className="font-semibold">{caseItem.risk.score}</span>.
                  </div>
                )}

                {!caseItem && <p className="text-sm text-[#667d93]">{nextStep}</p>}
              </div>
            </Panel>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Bulk campaign setup">
              <div className="grid gap-4">
                <SelectField label="Network provider" value={provider} options={["MTN", "Vodacom", "Cell C"]} onChange={(value) => setProvider(value as NetworkProvider)} />
                <InputField label="Source file name" value={campaignFileName} onChange={setCampaignFileName} />
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#26445f]">Unregistered customer CSV</span>
                  <textarea value={campaignCsv} onChange={(event) => setCampaignCsv(event.target.value)} className="min-h-44 w-full rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]" />
                </label>
                <input type="file" accept=".csv,text/csv" onChange={(event) => void loadCampaignFile(event.target.files?.[0] ?? null)} className="text-sm text-[#536b82]" />
                <button type="button" onClick={() => void sendCampaign()} className="rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white">
                  {busyKey === "campaign" ? "Sending..." : "Send campaign WhatsApp links"}
                </button>
                {campaignError && <p className="text-sm text-[#9a3b32]">{campaignError}</p>}
              </div>
            </Panel>

            <Panel title="Campaign queue">
              {campaignBatch && (
                <div className="mb-4 rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-4 text-sm text-[#284761]">
                  <p className="font-semibold text-[#17324a]">{campaignBatch.batchReference}</p>
                  <p>
                    {campaignBatch.provider} batch status {campaignBatch.status}: {campaignBatch.validCount} created, {campaignBatch.errorCount} errors from {campaignBatch.rowCount} rows.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={downloadProviderReport} className="secondary-action">
                      Export provider CSV
                    </button>
                    <Badge label="SFTP-ready schema" />
                  </div>
                </div>
              )}

              {campaignBatch?.errors.length ? (
                <div className="mb-4 grid gap-2">
                  {campaignBatch.errors.map((error) => (
                    <div key={`${error.rowNumber}-${error.message}`} className="rounded-2xl border border-[#f0d4ce] bg-[#fff7f5] px-4 py-3 text-sm text-[#854239]">
                      Row {error.rowNumber}: {error.message}
                    </div>
                  ))}
                </div>
              ) : null}

              {campaignCases.length ? (
                <div className="grid gap-3">
                  {campaignCases.map((kycCase) => (
                    <div key={kycCase.id} className="rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-4 text-sm text-[#284761]">
                      <p className="font-semibold text-[#17324a]">{kycCase.reference}</p>
                      <p>{kycCase.tenant} WhatsApp KYC sent to {kycCase.applicant.phoneNumber}</p>
                      <p className="mt-1 text-[#667d93]">Status: {kycCase.status}</p>
                      {(kycCase.residenceEvidence?.towerId || kycCase.residenceEvidence?.locationEvidence) && (
                        <p className="mt-1 text-[#667d93]">
                          Residence evidence: {kycCase.residenceEvidence?.towerId ?? "no tower"} / {kycCase.residenceEvidence?.locationEvidence ?? "no provider evidence"}
                        </p>
                      )}
                      {kycCase.secureSessionToken && (
                        <Link href={`/verify/${kycCase.secureSessionToken}`} className="mt-2 inline-block font-medium text-[#1f4b6d] underline">
                          Open secure KYC link
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-[#667d93]">
                  Bulk campaigns accept fullName, idNumber, phoneNumber, and optional towerId/locationEvidence. If residence evidence is missing, each customer completes affidavit and GPS capture in their secure session.
                </p>
              )}
            </Panel>
          </section>
        )}
      </section>
    </main>
  );
}

function getNextStep(kycCase: WhatsAppKycCase | null) {
  if (!kycCase) return "Start by sending the WhatsApp KYC message to the walk-in customer.";
  if (kycCase.status === "consent_pending") return "Customer must reply START KYC and AGREE.";
  if (kycCase.status === "details_pending") return "Customer submits name, SA ID, and mobile number.";
  if (kycCase.status === "selfie_pending") return "Customer opens the secure camera session.";
  if (kycCase.status === "otp_pending") return "Send and verify the OTP.";
  if (kycCase.status === "address_pending") return "Capture proof of address or affidavit.";
  if (kycCase.status === "location_pending") return "Capture live GPS location.";
  if (kycCase.status === "risk_review") return "Run final risk scoring.";
  return "KYC flow completed.";
}

function CaseSummary({ kycCase }: { kycCase: WhatsAppKycCase }) {
  return (
    <div className="rounded-2xl border border-[#d7e2ee] bg-[#f8fbfe] p-4 text-sm text-[#4d677f]">
      <p>Reference: <span className="font-semibold text-[#18344d]">{kycCase.reference}</span></p>
      <p>Status: <span className="font-semibold text-[#18344d]">{kycCase.status}</span></p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#d7e2ee] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#112a43]">{title}</h2>
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
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]" />
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
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-[#c8d6e3] px-4 py-3 text-sm outline-none focus:border-[#53718f]">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full bg-[#e8f0f6] px-3 py-1 text-xs font-semibold text-[#315069]">{label}</span>;
}

function modeButton(active: boolean) {
  return `rounded-xl px-4 py-3 text-sm font-semibold ${active ? "bg-[#0f2f3a] text-white" : "text-[#244661]"}`;
}
