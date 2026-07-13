"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { WhatsAppKycCase } from "@/lib/whatsapp-kyc";

const staffHeaders = {
  "x-staff-id": "dashboard-analyst-001",
  "x-staff-name": "KYC Dashboard Analyst",
  "x-staff-role": "supervisor",
};

type RoleView = "Sponsor" | "MNO" | "Admin";
type WorkView = "cases" | "batches";
type FilterView = "all" | "pending" | "approved" | "highRisk";
type SponsorTab = "business" | "technical";
type ReportMode = "single" | "bulk";

type QueueSnapshot = {
  configured: boolean;
  queues: Array<{ key: string; name: string; counts: Record<string, number> }>;
};

type BulkBatch = {
  id: string;
  batchReference: string;
  provider: string;
  sourceFileName: string;
  status: string;
  receivedAt: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  rows: Array<{
    id: string;
    rowNumber: number;
    phoneNumber: string;
    caseId: string;
    status: string;
    towerId: string;
    locationEvidence: string;
    createdAt: string;
  }>;
};

type WhatsAppTrace = {
  id: string;
  direction: "inbound" | "outbound";
  channel: "whatsapp";
  provider: string;
  messageSid: string;
  caseId?: string;
  caseReference?: string;
  from: string;
  to: string;
  transportSender?: string;
  logicalSender?: string;
  bodyPreview: string;
  status: string;
  reason?: string;
  occurredAt: string;
};

type ConnectivitySnapshot = {
  waba: {
    displayNumber: string;
    e164: string;
    configuredNumber: string;
    configured: boolean;
    connected: boolean;
    lastInboundAt: string | null;
  };
  twilio: {
    accountSid: string;
    webhookEndpoint: string;
    testEndpoint: string;
    transportSender: string;
    logicalSender: string;
    mode: string;
    lastOutboundAt: string | null;
  };
  inboundTraffic: WhatsAppTrace[];
  messageTraces: WhatsAppTrace[];
};

type DashboardPayload = {
  generatedAt: string;
  persistenceMode?: "supabase" | "memory";
  cases: WhatsAppKycCase[];
  bulkBatches: BulkBatch[];
  queue: QueueSnapshot;
  connectivity?: ConnectivitySnapshot;
  requestedBy?: {
    staffName?: string;
    staffRole?: string;
  };
};

const fallbackPayload: DashboardPayload = {
  generatedAt: "",
  cases: [],
  bulkBatches: [],
  queue: { configured: false, queues: [] },
};

export function KycDashboard() {
  const [payload, setPayload] = useState<DashboardPayload>(fallbackPayload);
  const [loading, setLoading] = useState(true);
  const [roleView, setRoleView] = useState<RoleView>("Sponsor");
  const [workView, setWorkView] = useState<WorkView>("cases");
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [selectedMetric, setSelectedMetric] = useState<FilterView>("all");
  const [sponsorTab, setSponsorTab] = useState<SponsorTab>("business");
  const [reportMode, setReportMode] = useState<ReportMode>("single");
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [lastRefreshError, setLastRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [connectivityTest, setConnectivityTest] = useState<{ status: string; checkedAt: string } | null>(null);
  const [testingConnectivity, setTestingConnectivity] = useState(false);

  useEffect(() => {
    void loadDashboard(true);
    const interval = window.setInterval(() => void loadDashboard(false), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  async function loadDashboard(showLoading: boolean) {
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const response = await fetch(`/api/dashboard?ts=${Date.now()}`, {
        headers: staffHeaders,
        cache: "no-store",
      });
      const nextPayload = (await response.json()) as DashboardPayload & { error?: string };
      if (!response.ok) {
        setLastRefreshError(nextPayload.error ?? "Dashboard refresh failed.");
        return;
      }
      setLastRefreshError("");
      setPayload(nextPayload);
      setSelectedCaseId((current) => current || nextPayload.cases[0]?.id || "");
      setSelectedBatchId((current) => current || nextPayload.bulkBatches[0]?.id || "");
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  }

  async function runConnectivityTest() {
    setTestingConnectivity(true);
    try {
      const response = await fetch(payload.connectivity?.twilio.testEndpoint ?? "/api/whatsapp/connectivity-test", {
        method: "POST",
        headers: staffHeaders,
      });
      const result = (await response.json().catch(() => null)) as { status?: string; checkedAt?: string } | null;
      setConnectivityTest({
        status: response.ok ? result?.status ?? "200 OK" : `${response.status} ${response.statusText}`,
        checkedAt: result?.checkedAt ?? new Date().toISOString(),
      });
    } finally {
      setTestingConnectivity(false);
    }
  }

  const sortedCases = useMemo(
    () => [...payload.cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [payload.cases]
  );
  const visibleCases = useMemo(() => sortedCases.filter((caseItem) => matchesFilter(caseItem, filterView)), [sortedCases, filterView]);
  const selectedCase = sortedCases.find((caseItem) => caseItem.id === selectedCaseId) ?? sortedCases[0] ?? null;
  const selectedBatch = payload.bulkBatches.find((batch) => batch.id === selectedBatchId) ?? payload.bulkBatches[0] ?? null;
  const metrics = useMemo(() => buildMetrics(sortedCases), [sortedCases]);
  const queueTotals = useMemo(() => summarizeQueues(payload.queue), [payload.queue]);
  const riskDistribution = useMemo(() => buildRiskDistribution(sortedCases), [sortedCases]);
  const decisionDistribution = useMemo(() => buildDecisionDistribution(sortedCases), [sortedCases]);

  return (
    <main className="min-h-screen bg-[#dfe7e5] text-[#102033]" style={{ fontFamily: "Inter, Roboto, Open Sans, Arial, sans-serif" }}>
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#b6c3c7] pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-12 place-items-center rounded-md bg-[#1fb393] text-xl font-black text-[#06131a]">K</div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-[#102033] sm:text-3xl">KYC-Now Processing Dashboard</h1>
              <p className="mt-1 text-sm text-[#365468]">Unified case, batch, evidence, and audit analytics</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(["Sponsor", "MNO", "Admin"] as RoleView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => {
                  setRoleView(view);
                  if (view === "MNO") setWorkView("batches");
                  if (view === "Sponsor") setSponsorTab("business");
                }}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  roleView === view ? "border-[#56d39f] bg-[#123528] text-[#80f0b2] shadow-[0_0_0_3px_rgba(86,211,159,0.15)]" : "border-[#2a3645] bg-[#111923] text-[#b7c6d1]"
                }`}
              >
                {view}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="rounded-md border border-[#2a3645] bg-[#111923] px-3 py-2 text-sm font-semibold text-[#b7c6d1] disabled:cursor-wait disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {lastRefreshError && <p className="rounded-md border border-[#7f2d2d] bg-[#321316] px-4 py-3 text-sm text-[#ffb4a8]">{lastRefreshError}</p>}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon="BI" label="Total Cases" value={String(metrics.total)} tone="blue" active={selectedMetric === "all"} onClick={() => { setSelectedMetric("all"); setFilterView("all"); }} />
          <MetricCard icon="!" label="Pending Verifications" value={String(metrics.pending)} tone="amber" active={selectedMetric === "pending"} onClick={() => { setSelectedMetric("pending"); setFilterView("pending"); }} />
          <MetricCard icon="OK" label="Approved Cases" value={String(metrics.approved)} tone="green" active={selectedMetric === "approved"} onClick={() => { setSelectedMetric("approved"); setFilterView("approved"); }} />
          <MetricCard icon="LOCK" label="High Risk Alerts" value={String(metrics.highRisk)} tone="red" active={selectedMetric === "highRisk"} onClick={() => { setSelectedMetric("highRisk"); setFilterView("highRisk"); }} />
        </section>

        {roleView === "Sponsor" && (
          <section id="sponsor-proof-tabs" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSponsorTab("business")} className={`rounded-md px-4 py-2 text-sm font-black shadow-sm ${sponsorTab === "business" ? "bg-[#102033] text-white" : "bg-white text-[#102033] border border-[#c6d1d4]"}`}>Sponsor Cockpit</button>
              <button type="button" onClick={() => setSponsorTab("technical")} className={`rounded-md px-4 py-2 text-sm font-black shadow-sm ${sponsorTab === "technical" ? "bg-[#102033] text-white" : "bg-white text-[#102033] border border-[#c6d1d4]"}`}>Technical Proof</button>
            </div>
            {sponsorTab === "business" ? (
              <SponsorCockpitPanel cases={sortedCases} connectivity={payload.connectivity} onSelectCase={setSelectedCaseId} onExport={() => downloadSponsorCsv(visibleCases, payload.bulkBatches, reportMode, "kyc-now-sponsor-executive-export.csv")} />
            ) : (
              <Panel
                title="Meta & Twilio Connectivity"
                action={
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void runConnectivityTest()} className="rounded-md bg-[#0f8f70] px-3 py-2 text-xs font-bold text-white shadow-sm">
                      {testingConnectivity ? "Testing..." : "Test Twilio 200 OK"}
                    </button>
                    <button type="button" onClick={() => window.print()} className="rounded-md border border-[#6d7d86] bg-white px-3 py-2 text-xs font-bold text-[#102033] shadow-sm">
                      Export Proof PDF
                    </button>
                  </div>
                }
              >
                <MetaTwilioConnectivityPanel payload={payload} connectivityTest={connectivityTest} />
              </Panel>
            )}
          </section>
        )}

        {roleView === "Sponsor" && (
          <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_1fr_1fr]">
            <Panel title="Sponsor View" action={<button type="button" onClick={() => downloadSponsorCsv(visibleCases, payload.bulkBatches, reportMode, "kyc-now-sponsor-excel-export.csv")} className="rounded-md bg-[#0f8f70] px-3 py-2 text-xs font-bold text-white">Export Excel CSV</button>}>
              <SponsorOverviewPanel cases={sortedCases} connectivity={payload.connectivity} />
            </Panel>
            <Panel title="Risk Heatmap">
              <RiskHeatmap cases={sortedCases} onSelect={setSelectedCaseId} />
            </Panel>
            <Panel title="Verification Trends">
              <TrendPanel cases={sortedCases} />
            </Panel>
          </section>
        )}

        {roleView === "Sponsor" && (
          <>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr_1.2fr]">
              <Panel title="Decision Workflow">
                <DecisionWorkflowPanel caseItem={selectedCase} />
              </Panel>
              <Panel title="Risk Breakdown">
                <CaseRiskBreakdown caseItem={selectedCase} />
              </Panel>
              <Panel title="Executive Case Outcomes" action={<CaseFilters active={filterView} onChange={setFilterView} />}>
                <CaseTable cases={visibleCases} selectedCaseId={selectedCase?.id ?? ""} onSelect={setSelectedCaseId} loading={loading} />
              </Panel>
            </section>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr_1fr]">
              <Panel title="Risk & Decision Analysis">
                <RiskPanel riskDistribution={riskDistribution} decisionDistribution={decisionDistribution} />
              </Panel>
              <Panel title="Evidence Completeness">
                <CompletenessPanel caseItem={selectedCase} />
              </Panel>
            </section>
            <section className="grid min-w-0 gap-5 lg:grid-cols-[1fr_1fr]">
              <Panel title="Selected Case Snapshot">
                <SponsorCaseSnapshot caseItem={selectedCase} />
              </Panel>
              <Panel title="Sponsor Export">
                <SponsorExportPanel cases={visibleCases} batches={payload.bulkBatches} generatedAt={payload.generatedAt} reportMode={reportMode} onModeChange={setReportMode} />
              </Panel>
            </section>
          </>
        )}

        {roleView === "MNO" && (
          <>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr_1fr]">
              <Panel title="Bulk Batch Processing">
                <BulkPanel batch={selectedBatch} queueTotals={queueTotals} />
              </Panel>
              <Panel title="Provider Conversion Funnel">
                <ProviderFunnel cases={sortedCases} />
              </Panel>
              <Panel title="Batch Queue">
                <BatchTable batches={payload.bulkBatches} selectedBatchId={selectedBatch?.id ?? ""} onSelect={setSelectedBatchId} />
              </Panel>
            </section>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr_1fr]">
              <Panel title="Provider Performance">
                <ProviderPanel cases={sortedCases} batches={payload.bulkBatches} />
              </Panel>
              <Panel title="MSISDN Row Outcomes">
                <MnoRowsPanel batch={selectedBatch} cases={sortedCases} />
              </Panel>
              <Panel title="Queue Health">
                <QueueHealthPanel queue={payload.queue} queueTotals={queueTotals} />
              </Panel>
            </section>
          </>
        )}

        {roleView === "Admin" && (
          <>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_1fr_1.1fr]">
              <Panel title="Case Overview" action={<CaseFilters active={filterView} onChange={setFilterView} />}>
                <div className="mb-3 flex gap-2">
                  {(["cases", "batches"] as WorkView[]).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setWorkView(view)}
                      className={`h-9 flex-1 rounded-md text-sm font-semibold ${
                        workView === view ? "bg-[#28c989] text-[#071118]" : "bg-[#111923] text-[#9db1c0]"
                      }`}
                    >
                      {view === "cases" ? "Single & Case View" : "Bulk Batch View"}
                    </button>
                  ))}
                </div>
                {workView === "cases" ? (
                  <CaseTable cases={visibleCases} selectedCaseId={selectedCase?.id ?? ""} onSelect={setSelectedCaseId} loading={loading} />
                ) : (
                  <BatchTable batches={payload.bulkBatches} selectedBatchId={selectedBatch?.id ?? ""} onSelect={setSelectedBatchId} />
                )}
              </Panel>
              <Panel title="Applicant Identity">
                <IdentityPanel caseItem={selectedCase} />
              </Panel>
              <Panel title="Evidence Capture">
                <EvidencePanel caseItem={selectedCase} />
              </Panel>
            </section>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr_1fr]">
              <Panel title="Audit Trail" action={<button type="button" onClick={() => downloadCasesCsv(visibleCases)} className="rounded-md bg-[#2b3443] px-3 py-2 text-xs font-bold text-white">Export CSV</button>}>
                <AuditPanel caseItem={selectedCase} roleView={roleView} />
              </Panel>
              <Panel title="Audit Trail Timeline">
                <AuditTimeline caseItem={selectedCase} />
              </Panel>
              <Panel title="Queue Health">
                <QueueHealthPanel queue={payload.queue} queueTotals={queueTotals} />
              </Panel>
            </section>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1fr_1fr_1fr]">
              <Panel title="Uploaded Evidence Gallery">
                <EvidenceGallery caseItem={selectedCase} />
              </Panel>
              <Panel title="System Diagnostics">
                <AdminDiagnostics caseItem={selectedCase} payload={payload} queueTotals={queueTotals} />
              </Panel>
              <Panel title="Raw Evidence Completeness">
                <CompletenessPanel caseItem={selectedCase} />
              </Panel>
            </section>
          </>
        )}

        <section className="grid gap-5 lg:grid-cols-3">
          <Panel title="Role View">
            <RolePanel roleView={roleView} />
          </Panel>
          <Panel title="Evidence Completeness">
            <CompletenessPanel caseItem={selectedCase} />
          </Panel>
          <Panel title="System Sync">
            <div className="space-y-3 text-sm text-[#b8c8d4]">
              <InfoLine label="Generated UTC" value={formatUtc(payload.generatedAt)} />
              <InfoLine label="Refresh" value="Live no-cache polling every 15s" />
              <InfoLine label="Queue Engine" value={payload.queue.configured ? "BullMQ / Redis configured" : "Prototype queue snapshot"} />
              <InfoLine label="Cases Source" value={payload.persistenceMode === "supabase" ? "Live Supabase/Postgres via /api/dashboard" : "In-memory prototype fallback"} />
            </div>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#c6d1d4] bg-white shadow-[0_18px_45px_rgba(16,32,51,0.14)] transition duration-200">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#d4dde0] bg-gradient-to-r from-[#102033] to-[#0f6f63] px-4">
        <h2 className="text-lg font-semibold text-[#f4f7fa]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({ icon, label, value, tone, active, onClick }: { icon: string; label: string; value: string; tone: "blue" | "green" | "amber" | "red"; active?: boolean; onClick?: () => void }) {
  const color = {
    blue: "text-[#1d6ea3]",
    green: "text-[#087f5b]",
    amber: "text-[#b76b00]",
    red: "text-[#c2382b]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-24 items-center justify-between rounded-md border bg-white px-4 text-left shadow-[0_14px_34px_rgba(16,32,51,0.12)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(16,32,51,0.18)] ${active ? "border-[#0f8f70] ring-2 ring-[#0f8f70]/20" : "border-[#c6d1d4]"}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 place-items-center rounded-md bg-[#e6f3ef] text-xl">{icon}</span>
        <p className="text-base font-bold text-[#102033]">{label}</p>
      </div>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
    </button>
  );
}

function CaseFilters({ active, onChange }: { active: FilterView; onChange: (value: FilterView) => void }) {
  const filters: Array<{ key: FilterView; label: string }> = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "highRisk", label: "High Risk" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {filters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onChange(filter.key)}
          className={`rounded px-2 py-1 text-xs font-bold ${active === filter.key ? "bg-[#28c989] text-[#071118]" : "bg-[#111923] text-[#9fb0bd]"}`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function CaseTable({ cases, selectedCaseId, onSelect, loading }: { cases: WhatsAppKycCase[]; selectedCaseId: string; onSelect: (id: string) => void; loading: boolean }) {
  if (loading) return <p className="py-8 text-center text-sm text-[#8ea4b5]">Loading dashboard records...</p>;
  if (!cases.length) return <p className="py-8 text-center text-sm text-[#8ea4b5]">No matching cases yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] table-fixed text-left text-sm">
        <thead className="text-xs uppercase text-[#98aaba]">
          <tr className="border-b border-[#2c3847]">
            <th className="w-[92px] py-2 pr-3">Case ID</th>
            <th className="w-[118px] py-2 pr-3">MSISDN</th>
            <th className="w-[80px] py-2 pr-3">Provider</th>
            <th className="py-2 pr-3">Status</th>
            <th className="w-[74px] py-2">Risk</th>
          </tr>
        </thead>
        <tbody>
          {cases.slice(0, 8).map((caseItem) => (
            <tr
              key={caseItem.id}
              onClick={() => onSelect(caseItem.id)}
              className={`cursor-pointer border-b border-[#1d2834] ${caseItem.id === selectedCaseId ? "bg-[#1b3b35]" : "hover:bg-[#172230]"}`}
            >
              <td className="break-words py-3 pr-3 font-semibold text-white">{caseItem.reference}</td>
              <td className="break-words py-3 pr-3 text-[#d8e2ea]">{caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber}</td>
              <td className="py-3 pr-3 text-[#d8e2ea]">{caseItem.tenant}</td>
              <td className="break-words py-3 pr-3 text-[#ffd76a]">{friendlyStatus(caseItem)}</td>
              <td className="py-3 font-bold text-[#72e67d]">{caseItem.risk?.score ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchTable({ batches, selectedBatchId, onSelect }: { batches: BulkBatch[]; selectedBatchId: string; onSelect: (id: string) => void }) {
  if (!batches.length) return <p className="py-8 text-center text-sm text-[#8ea4b5]">No bulk batches ingested yet.</p>;
  return (
    <div className="space-y-2">
      {batches.slice(0, 6).map((batch, index) => (
        <button
          key={batch.id || `${batch.batchReference}-${index}`}
          type="button"
          onClick={() => onSelect(batch.id)}
          className={`w-full rounded-md border px-3 py-3 text-left ${batch.id === selectedBatchId ? "border-[#28c989] bg-[#1b3b35]" : "border-[#2a3645] bg-[#111923]"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-white">{batch.batchReference}</p>
            <p className="text-sm text-[#80f0b2]">{batch.validCount}/{batch.rowCount}</p>
          </div>
          <p className="mt-1 text-xs text-[#9eb0bd]">{batch.provider} / {formatUtc(batch.receivedAt)}</p>
        </button>
      ))}
    </div>
  );
}

function DecisionWorkflowPanel({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  const proof = caseItem?.verification.proofOfAddressDocument;
  const hasAffidavit = Boolean(caseItem?.affidavit);
  const activePath = proof?.accepted ? "valid" : proof?.reviewReason ? "expired" : hasAffidavit ? "affidavit" : "missing";
  const steps = [
    { key: "valid", label: "Valid proof < 3 months", outcome: "Approve path", tone: "pass" },
    { key: "expired", label: "Expired proof > 3 months", outcome: "Affidavit + Review", tone: "review" },
    { key: "missing", label: "No proof of address", outcome: "Affidavit mandatory", tone: "fail" },
  ] as const;

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.key} className={`grid grid-cols-[1fr_110px] items-center gap-3 rounded-md border p-3 ${activePath === step.key ? "border-[#60d99c] bg-[#17362f]" : "border-[#273341] bg-[#0e151d]"}`}>
          <div>
            <p className="font-semibold text-white">{step.label}</p>
            <p className="mt-1 text-xs text-[#9eb0bd]">{step.outcome}</p>
          </div>
          <span className={`rounded px-3 py-2 text-center text-xs font-black ${workflowTone(step.tone)}`}>{step.tone === "pass" ? "Proceed" : step.tone === "review" ? "Review" : "Reject"}</span>
        </div>
      ))}
      <p className="text-xs leading-5 text-[#9eb0bd]">
        Current path: <span className="font-semibold text-white">{activePath === "valid" ? "valid proof accepted" : activePath === "expired" ? "expired proof requires affidavit fallback" : activePath === "affidavit" ? "affidavit fallback captured" : "proof missing, affidavit required"}</span>.
      </p>
    </div>
  );
}

function CaseRiskBreakdown({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect risk factors." />;
  const factors = buildRiskFactors(caseItem);
  return (
    <div className="space-y-3">
      {factors.map((factor) => (
        <div key={factor.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-[#102033]">{factor.label}</span>
            <span className={factor.score >= 80 ? "text-[#80f0b2]" : factor.score >= 60 ? "text-[#ffd76a]" : "text-[#ff8b75]"}>{factor.score}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#2a3442]">
            <div className="h-full rounded-full" style={{ width: `${Math.max(4, factor.score)}%`, background: factor.color }} />
          </div>
          {factor.reason && <p className="mt-1 text-xs text-[#607484]">{factor.reason}</p>}
        </div>
      ))}
    </div>
  );
}

function IdentityPanel({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect identity evidence." />;
  const idValidation = caseItem.verification.idValidation;
  return (
    <div className="space-y-4 text-sm">
      <InfoLine label="Full Name" value={caseItem.applicant.fullName ?? "Pending"} strong />
      <InfoLine label="SA ID Number" value={caseItem.applicant.idNumber ?? "Pending"} />
      <InfoLine label="ID Check" value={idValidation?.isValid ? "Valid checksum" : "Pending or failed"} status={idValidation?.isValid ? "pass" : "review"} />
      <InfoLine label="Document Upload" value={caseItem.verification.identityDocument ? `${caseItem.verification.identityDocument.documentType} OCR ${Math.round(caseItem.verification.identityDocument.ocrConfidence * 100)}%` : "Pending"} />
      <InfoLine label="Extracted ID" value={caseItem.verification.identityDocument?.extractedIdNumber ?? "Pending"} />
      <InfoLine label="ID OCR match" value={caseItem.verification.identityDocument?.matchedEnteredId === true ? "Matches entered ID" : caseItem.verification.identityDocument?.matchedEnteredId === false ? "Mismatch" : "Pending"} status={caseItem.verification.identityDocument?.matchedEnteredId === false ? "review" : caseItem.verification.identityDocument?.matchedEnteredId === true ? "pass" : undefined} />
    </div>
  );
}

function EvidencePanel({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect evidence capture." />;
  const proof = caseItem.verification.proofOfAddressDocument;
  const gps = caseItem.residenceEvidence?.gpsCoordinates ?? caseItem.geoCapture;
  const proofStatus = getProofStatus(caseItem);
  return (
    <div className="space-y-3 text-sm">
      <InfoLine label="Proof / Affidavit" value={proofStatus.label} status={proofStatus.status} />
      {proof?.reviewReason && <InfoLine label="RICA fallback" value={proof.reviewReason} status="review" />}
      <InfoLine label="Affidavit fallback" value={caseItem.affidavit ? `Uploaded / AI ${Math.round((caseItem.affidavit.aiValidationScore ?? 0) * 100)}%` : proof?.reviewReason ? "Requested" : "Not required"} status={caseItem.affidavit ? "pass" : proof?.reviewReason ? "review" : undefined} />
      <InfoLine label="Extracted affidavit ID" value={caseItem.affidavit?.extractedIdNumber ?? "Pending"} />
      <InfoLine label="Affidavit ID match" value={caseItem.affidavit?.matchedIdNumber === true ? "Matches entered ID" : caseItem.affidavit?.matchedIdNumber === false ? "Mismatch" : "Pending"} status={caseItem.affidavit?.matchedIdNumber === false ? "review" : caseItem.affidavit?.matchedIdNumber === true ? "pass" : undefined} />
      <InfoLine label="Selfie Match" value={caseItem.verification.faceMatchScore ? `${Math.round(caseItem.verification.faceMatchScore * 100)}% face match` : "Pending"} status={caseItem.verification.faceMatchScore ? "pass" : "review"} />
      <InfoLine label="Liveness" value={caseItem.verification.livenessScore ? `${Math.round(caseItem.verification.livenessScore * 100)}%` : "Pending"} />
      <InfoLine label="GPS / Tower" value={gps ? `${gps.latitude}, ${gps.longitude} / ${caseItem.residenceEvidence?.towerId ?? caseItem.geoCapture?.towerId ?? "tower pending"}` : caseItem.staffInitiation.bulkCampaign?.towerId ?? "Pending"} />
      <InfoLine label="Device / IP" value={caseItem.deviceIntelligence?.ipAddress ?? caseItem.deviceIntelligence?.browserFingerprint ?? "Pending"} />
    </div>
  );
}

function SponsorCockpitPanel({ cases, connectivity, onSelectCase, onExport }: { cases: WhatsAppKycCase[]; connectivity?: ConnectivitySnapshot; onSelectCase: (id: string) => void; onExport: () => void }) {
  const approved = cases.filter(isApprovedCase).length;
  const failed = cases.filter(isRejectedCase).length;
  const review = cases.filter((caseItem) => caseItem.risk?.decision === "REVIEW" || caseItem.status === "manual_review").length;
  const pending = Math.max(0, cases.length - approved - failed - review);
  const approvalRate = cases.length ? Math.round((approved / cases.length) * 100) : 0;
  const highRisk = cases.filter((caseItem) => riskLevel(caseItem) === "High").length;
  const riskScore = cases.length ? Math.round((highRisk / cases.length) * 100) : 0;
  const complianceReady = Boolean(connectivity?.waba.configured && connectivity?.twilio.logicalSender);
  return (
    <Panel
      title="Sponsor Cockpit"
      action={<button type="button" onClick={onExport} className="rounded-md bg-[#0f8f70] px-4 py-2 text-xs font-black text-white shadow-sm">Export Executive Pack</button>}
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <ExecutiveMetric label="Cases Processed" value={String(cases.length)} tone="blue" symbol="BI" />
          <ExecutiveMetric label="Approval Rate" value={`${approvalRate}%`} tone="green" symbol="OK" />
          <ExecutiveMetric label="Compliance Ready" value={complianceReady ? "Ready" : "Review"} tone={complianceReady ? "green" : "amber"} symbol={complianceReady ? "OK" : "!"} />
          <ExecutiveMetric label="Risk Score" value={`${riskScore}/100`} tone={riskScore > 30 ? "red" : "amber"} symbol={riskScore > 30 ? "FAIL" : "WARN"} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
          <ConversionFunnel pending={pending} review={review} approved={approved} failed={failed} />
          <TrendPanel cases={cases} />
          <ProviderRiskHeatmap cases={cases} />
        </div>
        <RiskHeatmap cases={cases} onSelect={onSelectCase} />
      </div>
    </Panel>
  );
}

function ExecutiveMetric({ label, value, tone, symbol }: { label: string; value: string; tone: "blue" | "green" | "amber" | "red"; symbol: string }) {
  const palette = {
    blue: "border-[#b7d8ea] bg-[#edf7fb] text-[#174d71]",
    green: "border-[#9bd6b8] bg-[#e1f5ec] text-[#087f5b]",
    amber: "border-[#e0be63] bg-[#fff4d8] text-[#9a6500]",
    red: "border-[#e58c7f] bg-[#ffe1dc] text-[#b42318]",
  }[tone];
  return (
    <div className={`min-h-32 rounded-md border p-4 shadow-sm ${palette}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black uppercase tracking-[0.08em]">{label}</p>
        <span className="rounded bg-white/80 px-2 py-1 text-xs font-black">{symbol}</span>
      </div>
      <p className="mt-4 text-4xl font-black leading-none">{value}</p>
    </div>
  );
}

function ConversionFunnel({ pending, review, approved, failed }: { pending: number; review: number; approved: number; failed: number }) {
  const stages = [
    { label: "Pending", value: pending, color: "#1d6ea3" },
    { label: "Review", value: review, color: "#b76b00" },
    { label: "Approved", value: approved, color: "#087f5b" },
    { label: "Failed", value: failed, color: "#c2382b" },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));
  return (
    <div className="rounded-md border border-[#c6d1d4] bg-[#f8fbfb] p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#102033]">Conversion Funnel</h3>
      <div className="mt-4 space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.label}>
            <div className="flex items-center justify-between text-sm font-bold text-[#365468]"><span>{stage.label}</span><span>{stage.value}</span></div>
            <div className="mt-1 h-4 overflow-hidden rounded-full bg-[#dfe7e5]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(8, (stage.value / max) * (100 - index * 8))}%`, background: stage.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderRiskHeatmap({ cases }: { cases: WhatsAppKycCase[] }) {
  const providers = ["MTN", "Vodacom", "Telkom", "Cell C"];
  return (
    <div className="rounded-md border border-[#c6d1d4] bg-[#f8fbfb] p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#102033]">Risk Heatmap</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {providers.map((provider) => {
          const providerCases = cases.filter((caseItem) => caseItem.tenant === provider);
          const high = providerCases.filter((caseItem) => riskLevel(caseItem) === "High").length;
          const approved = providerCases.filter(isApprovedCase).length;
          const readiness = providerCases.length ? Math.round((approved / providerCases.length) * 100) : 0;
          const tone = high > 0 ? "border-[#e58c7f] bg-[#ffe1dc]" : providerCases.length ? "border-[#9bd6b8] bg-[#e1f5ec]" : "border-[#c6d1d4] bg-white";
          return (
            <div key={provider} className={`rounded-md border p-3 ${tone}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-[#102033]">{provider}</p>
                <p className="text-xs font-black text-[#102033]">{readiness}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
                <div className="h-full rounded-full bg-[#087f5b]" style={{ width: `${Math.max(6, readiness)}%` }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-[#365468]">{providerCases.length} cases / {high} high risk</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function SponsorOverviewPanel({ cases, connectivity }: { cases: WhatsAppKycCase[]; connectivity?: ConnectivitySnapshot }) {
  const approved = cases.filter(isApprovedCase).length;
  const review = cases.filter((caseItem) => caseItem.risk?.decision === "REVIEW" || caseItem.status === "manual_review").length;
  const complianceReady = Boolean(connectivity?.waba.configured && connectivity?.twilio.logicalSender);
  return (
    <div className="space-y-3 text-sm text-[#365468]">
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Cases Processed" value={String(cases.length)} color="#1d6ea3" />
        <MiniStat label="Approval Rate" value={`${cases.length ? Math.round((approved / cases.length) * 100) : 0}%`} color="#087f5b" />
        <MiniStat label="Review Queue" value={String(review)} color="#b76b00" />
        <MiniStat label="Compliance Ready" value={complianceReady ? "Ready" : "Check"} color={complianceReady ? "#087f5b" : "#c2382b"} />
      </div>
      <p className="rounded-md border border-[#d4dde0] bg-[#f3f7f6] p-3 leading-6">
        Sponsor cockpit summarises WhatsApp KYC throughput, risk exceptions, and Meta/Twilio evidence for MTN, Vodacom, Telkom, and Cell C UAT reviews.
      </p>
    </div>
  );
}

function RiskHeatmap({ cases, onSelect }: { cases: WhatsAppKycCase[]; onSelect: (id: string) => void }) {
  const rows = cases.slice(0, 12);
  if (!rows.length) return <EmptyPanelText text="No cases available for heatmap." />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map((caseItem) => {
        const score = caseItem.risk?.score ?? 50;
        const bg = score >= 80 ? "bg-[#dff5eb] border-[#6bc89f]" : score >= 60 ? "bg-[#fff3cd] border-[#ddb85a]" : "bg-[#ffe1dc] border-[#e06b5b]";
        return (
          <button key={caseItem.id} type="button" onClick={() => onSelect(caseItem.id)} className={`rounded-md border p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${bg}`}>
            <p className="font-black text-[#102033]">{caseItem.reference}</p>
            <p className="mt-1 text-xs text-[#365468]">{caseItem.tenant} / {friendlyStatus(caseItem)}</p>
            <p className="mt-2 text-xl font-black text-[#102033]">{caseItem.risk?.score ?? "-"}</p>
          </button>
        );
      })}
    </div>
  );
}

function TrendPanel({ cases }: { cases: WhatsAppKycCase[] }) {
  const days = buildDailyTrends(cases);
  const max = Math.max(1, ...days.map((day) => day.total));
  return (
    <div className="rounded-md border border-[#c6d1d4] bg-[#f8fbfb] p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#102033]">Weekly Trend</h3>
      <div className="mt-4 flex h-36 items-end gap-2 rounded-md border border-[#d4dde0] bg-white p-3">
        {days.map((day) => (
          <div key={day.label} className="flex h-full flex-1 flex-col justify-end gap-1">
            <div className="rounded-t bg-[#0f8f70]" style={{ height: `${Math.max(8, (day.approved / max) * 92)}%` }} title={`${day.approved} approved`} />
            <div className="rounded-t bg-[#c2382b]" style={{ height: `${Math.max(4, ((day.total - day.approved) / max) * 46)}%` }} title={`${day.total - day.approved} review or failed`} />
            <p className="text-center text-[11px] font-bold text-[#365468]">{day.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label="Weekly Volume" value={String(days.reduce((sum, day) => sum + day.total, 0))} color="#1d6ea3" />
        <MiniStat label="Weekly Approved" value={String(days.reduce((sum, day) => sum + day.approved, 0))} color="#087f5b" />
      </div>
    </div>
  );
}
function MetaTwilioConnectivityPanel({ payload, connectivityTest }: { payload: DashboardPayload; connectivityTest: { status: string; checkedAt: string } | null }) {
  const connectivity = payload.connectivity;
  if (!connectivity) return <EmptyPanelText text="Connectivity proof has not loaded yet." />;

  const wabaTone = connectivity.waba.connected ? "pass" : "review";
  const wabaStatus = connectivity.waba.connected ? "Connected" : "Disconnected";
  const inboundRows = connectivity.inboundTraffic;
  const traceRows = connectivity.messageTraces;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-[#102033]">Meta WABA Number</p>
            <span className={`rounded px-2 py-1 text-xs font-black ${connectivity.waba.connected ? "bg-[#123528] text-[#80f0b2]" : "bg-[#3a1818] text-[#ff9b8e]"}`}>{wabaStatus}</span>
          </div>
          <p className="mt-3 text-2xl font-black text-[#102033]">{connectivity.waba.displayNumber}</p>
          <InfoLine label="Configured" value={connectivity.waba.configured ? connectivity.waba.configuredNumber : "Missing / mismatch"} status={connectivity.waba.configured ? "pass" : "review"} />
          <InfoLine label="Last inbound" value={formatUtc(connectivity.waba.lastInboundAt ?? undefined)} status={wabaTone} />
        </div>
        <div className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
          <p className="text-sm font-black text-[#102033]">Twilio Configuration Proof</p>
          <InfoLine label="Account SID" value={connectivity.twilio.accountSid} />
          <InfoLine label="Mode" value={connectivity.twilio.mode} />
          <InfoLine label="Webhook" value={connectivity.twilio.webhookEndpoint} />
          <InfoLine label="Transport" value={connectivity.twilio.transportSender} />
          <InfoLine label="Logical WABA" value={connectivity.twilio.logicalSender} />
        </div>
        <div className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
          <p className="text-sm font-black text-[#102033]">UAT Proof Capture</p>
          <InfoLine label="Webhook test" value={connectivityTest ? connectivityTest.status : "Not run"} status={connectivityTest?.status.includes("200") ? "pass" : "review"} />
          <InfoLine label="Tested UTC" value={formatUtc(connectivityTest?.checkedAt)} />
          <InfoLine label="Last outbound" value={formatUtc(connectivity.twilio.lastOutboundAt ?? undefined)} status={connectivity.twilio.lastOutboundAt ? "pass" : "review"} />
          <InfoLine label="Persistence" value={payload.persistenceMode === "supabase" ? "Supabase historical traces" : "Memory mode local traces"} status={payload.persistenceMode === "supabase" ? "pass" : "review"} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.2fr]">
        <div>
          <h3 className="mb-2 text-sm font-black uppercase tracking-[0.08em] text-[#9eb0bd]">Inbound Meta Traffic</h3>
          {inboundRows.length ? <TraceTable traces={inboundRows} compact /> : <EmptyPanelText text="No inbound Meta -> Twilio -> backend traffic captured yet." />}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-black uppercase tracking-[0.08em] text-[#9eb0bd]">Message Trace Log</h3>
          {traceRows.length ? <TraceTable traces={traceRows} /> : <EmptyPanelText text="Send an OTP or receive an inbound reply to create trace evidence." />}
        </div>
      </div>
    </div>
  );
}

function TraceTable({ traces, compact = false }: { traces: WhatsAppTrace[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#263240]">
      <table className="w-full min-w-[640px] table-fixed text-left text-xs">
        <thead className="bg-[#202734] uppercase text-[#98aaba]">
          <tr>
            <th className="w-28 px-3 py-2">UTC</th>
            <th className="w-24 px-3 py-2">Direction</th>
            <th className="w-28 px-3 py-2">Case</th>
            <th className="w-32 px-3 py-2">SID</th>
            {!compact && <th className="w-36 px-3 py-2">Route</th>}
            <th className="px-3 py-2">Status / Preview</th>
          </tr>
        </thead>
        <tbody>
          {traces.slice(0, compact ? 8 : 12).map((trace) => (
            <tr key={trace.id} className="border-t border-[#263240]">
              <td className="px-3 py-2 font-mono text-[#d8e2ea]">{formatUtc(trace.occurredAt).slice(5)}</td>
              <td className={trace.direction === "inbound" ? "px-3 py-2 font-bold text-[#8dd6ff]" : "px-3 py-2 font-bold text-[#80f0b2]"}>{trace.direction}</td>
              <td className="break-words px-3 py-2 font-bold text-white">{trace.caseReference ?? trace.caseId ?? "Unlinked"}</td>
              <td className="break-words px-3 py-2 font-mono text-[#c8d6df]">{trace.messageSid || "-"}</td>
              {!compact && <td className="break-words px-3 py-2 text-[#9eb0bd]">{trace.transportSender ?? trace.from} {"->"} {trace.logicalSender ?? trace.to}</td>}
              <td className="break-words px-3 py-2 text-[#d8e2ea]"><span className="font-bold text-[#ffd76a]">{trace.status}</span>{trace.bodyPreview ? ` / ${trace.bodyPreview}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function BulkPanel({ batch, queueTotals }: { batch: BulkBatch | null; queueTotals: { waiting: number; active: number; completed: number; failed: number } }) {
  const processed = batch ? Math.max(0, batch.validCount - queueTotals.waiting - queueTotals.active) : 0;
  const progress = batch?.validCount ? Math.min(100, Math.round((processed / batch.validCount) * 100)) : 0;
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[#202b37] bg-[#0e151d] p-3 text-sm">
        <InfoLine label="Batch ID" value={batch?.batchReference ?? "No batch selected"} strong />
        <InfoLine label="Uploaded UTC" value={batch ? formatUtc(batch.receivedAt) : "Pending"} />
      </div>
      <ProgressBar value={progress} label={`${processed} / ${batch?.validCount ?? 0} processed`} />
      <div className="grid grid-cols-3 gap-2 text-sm">
        <MiniStat label="Approved" value={String(queueTotals.completed)} color="#61dd71" />
        <MiniStat label="Failed" value={String(queueTotals.failed + (batch?.errorCount ?? 0))} color="#ff745c" />
        <MiniStat label="In Queue" value={String(queueTotals.waiting + queueTotals.active)} color="#ffd76a" />
      </div>
      <InfoLine label="Queue Status" value={queueTotals.active ? "KYC Case Review" : queueTotals.waiting ? "Waiting dispatch" : "Idle / prototype"} />
    </div>
  );
}

function AuditPanel({ caseItem, roleView }: { caseItem: WhatsAppKycCase | null; roleView: RoleView }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect audit events." />;
  const events = [...caseItem.auditTrail].slice(-8).reverse();
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="grid grid-cols-[72px_1fr] gap-3 border-b border-[#d4dde0] pb-2 text-sm">
          <p className="font-mono text-[#e8f0f6]">{formatTime(event.timestamp)}</p>
          <div>
            <p className="font-semibold text-[#102033]">{humanizeAction(event.action)}</p>
            {roleView === "Admin" && <p className="mt-1 text-xs text-[#8ea4b5]">{event.actorRole} / {event.actorId}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditTimeline({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect audit timeline." />;
  const importantActions = ["otp_sent", "otp_verified", "id_checksum_passed", "document_uploaded", "proof_uploaded", "proof_expired", "affidavit_requested", "affidavit_uploaded", "selfie_verified", "final_verification_complete"];
  const events = caseItem.auditTrail
    .filter((event) => importantActions.includes(event.action))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (!events.length) return <EmptyPanelText text="No timeline events captured yet." />;

  return (
    <div className="relative space-y-0 pl-5">
      <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[#3a4655]" />
      {events.map((event) => (
        <div key={event.id} className="relative border-b border-[#d4dde0] py-3 pl-4">
          <span className="absolute left-[-22px] top-4 size-3 rounded-full bg-[#d9e5ee] ring-4 ring-[#111923]" />
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[#102033]">{humanizeAction(event.action)}</p>
            <p className="font-mono text-xs text-[#9eb0bd]">{formatTime(event.timestamp)}</p>
          </div>
          <p className="mt-1 text-xs text-[#8ea4b5]">{formatUtc(event.timestamp)}</p>
        </div>
      ))}
    </div>
  );
}

function EvidenceGallery({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect uploaded photos." />;
  const media = [
    { label: "ID document", value: caseItem.documentUrls.idDocument },
    { label: "Selfie", value: caseItem.documentUrls.selfie },
    { label: "Proof of address", value: caseItem.documentUrls.proofOfAddress },
    { label: "Affidavit image", value: caseItem.documentUrls.affidavitImage },
  ].filter((item) => Boolean(item.value));

  if (!media.length) return <EmptyPanelText text="No uploaded evidence media is stored on this case yet." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {media.map((item) => (
        <EvidencePreview key={item.label} label={item.label} value={item.value ?? ""} />
      ))}
    </div>
  );
}

function EvidencePreview({ label, value }: { label: string; value: string }) {
  const isImage = value.startsWith("data:image/");
  const isPdf = value.startsWith("data:application/pdf");
  return (
    <div className="overflow-hidden rounded-md border border-[#263240] bg-[#0e151d]">
      <div className="border-b border-[#d4dde0] px-3 py-2 text-sm font-semibold text-[#102033]">{label}</div>
      {isImage ? (
        // Browser-selected evidence is stored as a data URL in the prototype case payload.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} className="h-40 w-full object-cover" />
      ) : isPdf ? (
        <a href={value} target="_blank" rel="noreferrer" className="block px-3 py-8 text-center text-sm font-semibold text-[#8dd6ff]">
          Open PDF evidence
        </a>
      ) : (
        <p className="px-3 py-8 text-center text-sm text-[#9eb0bd]">Stored evidence URL</p>
      )}
    </div>
  );
}

function RiskPanel({ riskDistribution, decisionDistribution }: { riskDistribution: Array<{ label: string; value: number; color: string }>; decisionDistribution: Array<{ label: string; value: number; color: string }> }) {
  const totalDecisions = decisionDistribution.reduce((sum, item) => sum + item.value, 0) || 1;
  const pass = decisionDistribution.find((item) => item.label === "Pass")?.value ?? 0;
  const passPercent = Math.round((pass / totalDecisions) * 100);
  const maxRiskValue = Math.max(1, ...riskDistribution.map((item) => item.value));
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-[#d4dde0] bg-[#f8fbfb] p-3">
        <p className="text-sm font-black uppercase tracking-[0.08em] text-[#365468]">Risk Breakdown</p>
        <div className="mt-3 flex h-40 items-end gap-6 overflow-hidden border-b border-[#d4dde0] px-3">
        {riskDistribution.map((item) => (
          <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <p className="text-sm font-black text-[#102033]">{item.value}</p>
            <div className="w-full rounded-t" style={{ height: `${Math.max(12, Math.round((item.value / maxRiskValue) * 96))}px`, background: item.color }} />
            <p className="text-sm font-black text-[#102033]">{item.label}</p>
          </div>
        ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_132px] sm:items-center">
        <div className="space-y-2 text-sm">
          <p className="font-black text-[#102033]">Decision Outcomes</p>
          {decisionDistribution.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: item.color }} />
              <span className="font-semibold text-[#365468]">{item.label}: {item.value}</span>
            </div>
          ))}
        </div>
        <div className="mx-auto grid size-32 place-items-center rounded-full" style={{ background: `conic-gradient(#26b86f 0 ${passPercent}%, #ef4444 ${passPercent}% 100%)` }}>
          <div className="grid size-20 place-items-center rounded-full bg-white text-center shadow-inner">
            <p className="text-2xl font-black text-[#102033]">{passPercent}%</p>
            <p className="text-xs font-bold text-[#365468]">Pass</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RolePanel({ roleView }: { roleView: RoleView }) {
  const text = {
    Sponsor: "Outcome snapshot, risk distribution, CSV exports, and live UAT readiness.",
    MNO: "Batch queue progress, row-level MSISDN status, provider totals, and dispatch health.",
    Admin: "Raw audit actors, immutable event trail, device/GPS/IP evidence, and queue diagnostics.",
  }[roleView];
  return <p className="text-sm leading-6 text-[#b8c8d4]">{text}</p>;
}

function SponsorCaseSnapshot({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to show sponsor-facing status." />;
  const proofStatus = getProofStatus(caseItem);
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <MiniStat label="Reference" value={caseItem.reference} color="#8dd6ff" />
      <MiniStat label="Decision" value={caseItem.risk?.decision ?? "REVIEW"} color={isApprovedCase(caseItem) ? "#61dd71" : "#ffd76a"} />
      <MiniStat label="Risk Score" value={String(caseItem.risk?.score ?? "Pending")} color="#ffac66" />
      <MiniStat label="Provider" value={caseItem.tenant} color="#80f0b2" />
      <div className="sm:col-span-2">
        <StatusPillLine label="Outcome" value={friendlyStatus(caseItem)} tone={isApprovedCase(caseItem) ? "pass" : isRejectedCase(caseItem) ? "fail" : "review"} />
        <InfoLine label="RICA Proof" value={proofStatus.label} status={proofStatus.status} />
        <InfoLine label="Updated UTC" value={formatUtc(caseItem.updatedAt)} />
      </div>
    </div>
  );
}

function SponsorExportPanel({
  cases,
  batches,
  generatedAt,
  reportMode,
  onModeChange,
}: {
  cases: WhatsAppKycCase[];
  batches: BulkBatch[];
  generatedAt: string;
  reportMode: ReportMode;
  onModeChange: (mode: ReportMode) => void;
}) {
  const approved = cases.filter(isApprovedCase).length;
  const failed = cases.filter(isRejectedCase).length;
  const review = Math.max(0, cases.length - approved - failed);
  const readiness = cases.length ? Math.round((approved / cases.length) * 100) : 0;
  const bulkRows = batches.reduce((sum, batch) => sum + batch.rowCount, 0);
  const bulkValid = batches.reduce((sum, batch) => sum + batch.validCount, 0);
  const bulkErrors = batches.reduce((sum, batch) => sum + batch.errorCount, 0);
  const bulkReadiness = bulkRows ? Math.round((bulkValid / bulkRows) * 100) : 0;
  const modeTitle =
    reportMode === "single"
      ? "Single RICA/FICA case evidence"
      : "Bulk campaign compliance evidence";
  return (
    <div className="relative overflow-hidden rounded-md border border-[#9bd6b8] bg-[#f8fbfb] p-4 text-sm text-[#365468] shadow-sm">
      <div className="pointer-events-none absolute right-4 top-4 rotate-6 rounded border-2 border-[#9bd6b8] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#087f5b] opacity-70">Audit-Proof</div>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#087f5b]">Sponsor Export</p>
      <h3 className="mt-2 max-w-lg text-2xl font-black leading-tight text-[#102033]">{modeTitle}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onModeChange("single")} className={`rounded-md px-3 py-2 text-xs font-black ${reportMode === "single" ? "bg-[#102033] text-white" : "border border-[#c6d1d4] bg-white text-[#102033]"}`}>
          Single RICA/FICA
        </button>
        <button type="button" onClick={() => onModeChange("bulk")} className={`rounded-md px-3 py-2 text-xs font-black ${reportMode === "bulk" ? "bg-[#102033] text-white" : "border border-[#c6d1d4] bg-white text-[#102033]"}`}>
          Bulk Campaign
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pr-28">
        {["MTN", "Vodacom", "Telkom", "Cell C"].map((name) => <span key={name} className="rounded-md border border-[#c6d1d4] bg-white px-3 py-2 text-xs font-black text-[#102033] shadow-sm">{name}</span>)}
      </div>
      {reportMode === "single" ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat label="Approved" value={String(approved)} color="#087f5b" />
          <MiniStat label="Review" value={String(review)} color="#b76b00" />
          <MiniStat label="Failed" value={String(failed)} color="#c2382b" />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat label="Batch Rows" value={String(bulkRows)} color="#1d6ea3" />
          <MiniStat label="Valid MSISDNs" value={String(bulkValid)} color="#087f5b" />
          <MiniStat label="Row Errors" value={String(bulkErrors)} color="#c2382b" />
        </div>
      )}
      <div className="mt-3 rounded-md border border-[#d4dde0] bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-black text-[#102033]">Compliance readiness</span>
          <span className="text-2xl font-black text-[#087f5b]">{reportMode === "single" ? readiness : bulkReadiness}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#dfe7e5]">
          <div className="h-full rounded-full bg-[#087f5b]" style={{ width: `${Math.max(5, reportMode === "single" ? readiness : bulkReadiness)}%` }} />
        </div>
      </div>
      <InfoLine label="Snapshot UTC" value={formatUtc(generatedAt)} />
      <InfoLine
        label="Compliance pack"
        value={reportMode === "single" ? "Per-case RICA/FICA outcome, risk score, audit trace, GPS/IP/device proof" : "Provider batch totals, MSISDN row outcomes, queue status, row error proof"}
        status="pass"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => downloadSponsorCsv(cases, batches, reportMode, reportMode === "single" ? "kyc-now-single-rica-fica-report.csv" : "kyc-now-bulk-campaign-report.csv")} className="rounded-md bg-[#0f8f70] px-4 py-2 text-sm font-bold text-white">
          Download Excel CSV
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-md border border-[#6d7d86] bg-white px-4 py-2 text-sm font-bold text-[#102033]">
          Export PDF View
        </button>
      </div>
    </div>
  );
}

function ProviderFunnel({ cases }: { cases: WhatsAppKycCase[] }) {
  const stages = [
    { label: "Pending", value: cases.filter((caseItem) => !caseItem.risk && !isApprovedCase(caseItem) && !isRejectedCase(caseItem)).length, color: "#5176d6" },
    { label: "Review", value: cases.filter((caseItem) => caseItem.status === "manual_review" || caseItem.risk?.decision === "REVIEW").length, color: "#e1ae28" },
    { label: "Approved", value: cases.filter(isApprovedCase).length, color: "#77c34f" },
    { label: "Failed", value: cases.filter(isRejectedCase).length, color: "#ef4444" },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="space-y-3">
      {stages.map((stage, index) => (
        <div key={stage.label} className="mx-auto text-center" style={{ width: `${Math.max(48, 100 - index * 12)}%` }}>
          <div className="rounded-md px-3 py-3 font-black text-[#102033] shadow-[0_10px_24px_rgba(0,0,0,0.28)]" style={{ background: stage.color, opacity: 0.72 + (stage.value / max) * 0.28 }}>
            {stage.label}: {stage.value}
          </div>
        </div>
      ))}
      <p className="text-xs leading-5 text-[#9eb0bd]">Conversion view helps MNOs compare campaign drop-off from queued cases through review and final decision.</p>
    </div>
  );
}

function ProviderPanel({ cases, batches }: { cases: WhatsAppKycCase[]; batches: BulkBatch[] }) {
  const providers = ["MTN", "Vodacom", "Cell C"];
  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const providerCases = cases.filter((caseItem) => caseItem.tenant === provider);
        const providerBatches = batches.filter((batch) => batch.provider === provider);
        return (
          <div key={provider} className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[#102033]">{provider}</p>
              <p className="text-sm font-bold text-[#087f5b]">{providerCases.length} cases</p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <MiniStat label="Batches" value={String(providerBatches.length)} color="#8dd6ff" />
              <MiniStat label="Approved" value={String(providerCases.filter(isApprovedCase).length)} color="#61dd71" />
              <MiniStat label="High Risk" value={String(providerCases.filter((caseItem) => riskLevel(caseItem) === "High").length)} color="#ff745c" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MnoRowsPanel({ batch, cases }: { batch: BulkBatch | null; cases: WhatsAppKycCase[] }) {
  if (!batch) return <EmptyPanelText text="Select a batch to inspect row-level MSISDN outcomes." />;
  const rows = Array.isArray(batch.rows) ? batch.rows.slice(0, 8) : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] table-fixed text-left text-sm">
        <thead className="text-xs uppercase text-[#98aaba]">
          <tr className="border-b border-[#2c3847]">
            <th className="w-16 py-2">Row</th>
            <th className="w-36 py-2">MSISDN</th>
            <th className="py-2">Status</th>
            <th className="w-24 py-2">Risk</th>
            <th className="w-28 py-2">Tower</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const caseItem = cases.find((candidate) => candidate.id === row.caseId);
            return (
              <tr key={row.id || `${batch.id}-${row.rowNumber}-${row.phoneNumber}`} className="border-b border-[#1d2834]">
                <td className="py-3 text-[#365468]">{row.rowNumber}</td>
                <td className="break-words py-3 font-semibold text-[#102033]">{row.phoneNumber}</td>
                <td className="break-words py-3 font-semibold text-[#b76b00]">{caseItem ? friendlyStatus(caseItem) : row.status}</td>
                <td className="py-3 font-black text-[#087f5b]">{caseItem?.risk?.score ?? "-"}</td>
                <td className="break-words py-3 text-[#365468]">{row.towerId || caseItem?.residenceEvidence?.towerId || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QueueHealthPanel({ queue, queueTotals }: { queue: QueueSnapshot; queueTotals: { waiting: number; active: number; completed: number; failed: number } }) {
  if (!queue.configured || queue.queues.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat label="OTP Jobs" value={`${queueTotals.completed} done`} color="#9ee7ff" />
        <MiniStat label="Verification Jobs" value={`${queueTotals.active} active`} color="#80f0b2" />
        <MiniStat label="Orchestration Jobs" value={`${queueTotals.waiting} queued`} color="#ffd76a" />
        <MiniStat label="Failed Jobs" value={String(queueTotals.failed)} color="#ff745c" />
        <p className="sm:col-span-2 text-xs leading-5 text-[#9eb0bd]">Redis/BullMQ is not configured in this environment, so this is a prototype queue snapshot.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {queue.queues.map((entry) => (
        <div key={entry.key} className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[#102033]">{entry.name}</p>
            <p className="text-xs text-[#ff8b75]">{entry.counts.failed ?? 0} failed</p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            <MiniStat label="Waiting" value={String(entry.counts.waiting ?? 0)} color="#ffd76a" />
            <MiniStat label="Active" value={String(entry.counts.active ?? 0)} color="#8dd6ff" />
            <MiniStat label="Done" value={String(entry.counts.completed ?? 0)} color="#80f0b2" />
            <MiniStat label="Failed" value={String(entry.counts.failed ?? 0)} color="#ff745c" />
          </div>
        </div>
      ))}
    </div>
  );
}

function QueuePanel({ queue }: { queue: QueueSnapshot }) {
  if (!queue.configured) {
    return <p className="text-sm leading-6 text-[#b8c8d4]">Redis/BullMQ is not configured in this environment. Dashboard is showing the prototype queue snapshot and persisted Supabase batch rows.</p>;
  }

  return (
    <div className="space-y-3">
      {queue.queues.map((entry) => (
        <div key={entry.key} className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
          <p className="font-semibold text-[#102033]">{entry.name}</p>
          <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
            {(["waiting", "active", "completed", "failed", "delayed"] as const).map((key) => (
              <MiniStat key={key} label={key} value={String(entry.counts[key] ?? 0)} color={key === "failed" ? "#ff745c" : "#8dd6ff"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminDiagnostics({ caseItem, payload, queueTotals }: { caseItem: WhatsAppKycCase | null; payload: DashboardPayload; queueTotals: { waiting: number; active: number; completed: number; failed: number } }) {
  return (
    <div className="space-y-3 text-sm">
      <InfoLine label="Persistence" value={payload.persistenceMode === "supabase" ? "Supabase/Postgres" : "Memory fallback"} />
      <InfoLine label="Generated UTC" value={formatUtc(payload.generatedAt)} />
      <InfoLine label="Case ID" value={caseItem?.id ?? "No case selected"} />
      <InfoLine label="Audit Events" value={String(caseItem?.auditTrail.length ?? 0)} />
      <InfoLine label="Queue Active" value={String(queueTotals.active)} />
      <InfoLine label="Queue Failed" value={String(queueTotals.failed)} />
      <InfoLine label="Device Fingerprint" value={caseItem?.deviceIntelligence?.browserFingerprint ? "Captured" : "Pending"} />
      <InfoLine label="GPS Evidence" value={caseItem?.verification.locationShared ? "Captured" : "Pending"} />
      <InfoLine label="Affidavit Fallback" value={caseItem?.affidavit ? "Uploaded" : caseItem?.verification.proofOfAddressDocument?.reviewReason ? "Requested" : "Not triggered"} status={caseItem?.affidavit ? "pass" : caseItem?.verification.proofOfAddressDocument?.reviewReason ? "review" : undefined} />
    </div>
  );
}

function CompletenessPanel({ caseItem }: { caseItem: WhatsAppKycCase | null }) {
  if (!caseItem) return <EmptyPanelText text="Select a case to inspect completeness." />;
  const checks = [
    ["OTP", caseItem.verification.otp?.status === "verified"],
    ["SA ID", Boolean(caseItem.verification.identityDocument)],
    ["Proof / affidavit", Boolean(caseItem.verification.proofOfAddressProvided || caseItem.verification.digitalAffidavitProvided)],
    ["Selfie", Boolean(caseItem.verification.faceMatchScore)],
    ["Location", Boolean(caseItem.verification.locationShared || caseItem.residenceEvidence?.gpsCoordinates)],
    ["Device", Boolean(caseItem.deviceIntelligence?.browserFingerprint || caseItem.deviceIntelligence?.ipAddress)],
  ] as Array<[string, boolean]>;
  const done = checks.filter(([, complete]) => complete).length;
  const percent = Math.round((done / checks.length) * 100);
  return (
    <div className="grid gap-4 sm:grid-cols-[132px_1fr] sm:items-center">
      <div className="mx-auto grid size-32 place-items-center rounded-full" style={{ background: `conic-gradient(#087f5b 0 ${percent}%, #dfe7e5 ${percent}% 100%)` }}>
        <div className="grid size-24 place-items-center rounded-full bg-white text-center shadow-inner">
          <p className="text-3xl font-black text-[#102033]">{percent}%</p>
          <p className="text-xs font-bold text-[#607484]">complete</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {checks.map(([label, complete]) => (
          <div key={label} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm font-bold ${complete ? "border-[#9bd6b8] bg-[#e1f5ec] text-[#087f5b]" : "border-[#e0be63] bg-[#fff4d8] text-[#9a6500]"}`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-black ${complete ? "bg-[#087f5b] text-white" : "bg-[#b76b00] text-white"}`}>
                {complete ? "OK" : "!"}
              </span>
              <span>{label}</span>
            </span>
            <span className="rounded bg-white/80 px-2 py-1 text-xs">{complete ? "Captured" : "Pending"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function workflowTone(tone: "pass" | "review" | "fail") {
  if (tone === "pass") return "bg-[#e1f5ec] text-[#087f5b]";
  if (tone === "review") return "bg-[#fff4d8] text-[#9a6500]";
  return "bg-[#ffe1dc] text-[#b42318]";
}

function InfoLine({ label, value, strong, status }: { label: string; value: string; strong?: boolean; status?: "pass" | "review" }) {
  return (
    <div className="grid min-h-10 grid-cols-[112px_1fr] items-center gap-4 border-b border-[#d4dde0] pb-2">
      <span className="font-medium text-[#365468]">{label}</span>
      <span className={`min-w-0 break-words text-right ${strong ? "font-black text-[#102033]" : "font-semibold text-[#102033]"} ${status === "pass" ? "text-[#087f5b]" : ""} ${status === "review" ? "text-[#b76b00]" : ""}`}>{value}</span>
    </div>
  );
}

function StatusPillLine({ label, value, tone }: { label: string; value: string; tone: "pass" | "review" | "fail" }) {
  const palette = {
    pass: "bg-[#e1f5ec] text-[#087f5b] border-[#9bd6b8]",
    review: "bg-[#fff4d8] text-[#9a6500] border-[#e0be63]",
    fail: "bg-[#ffe1dc] text-[#b42318] border-[#e58c7f]",
  }[tone];
  const symbol = tone === "pass" ? "OK" : tone === "review" ? "!" : "X";
  return (
    <div className="grid min-h-10 grid-cols-[112px_1fr] items-center gap-4 border-b border-[#d4dde0] pb-2">
      <span className="font-medium text-[#365468]">{label}</span>
      <span className={`justify-self-end rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${palette}`}>{symbol} {value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-[#c6d1d4] bg-white p-3 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#607484]">{label}</p>
      <p className="mt-1 text-xl font-black" style={{ color }}>{value}</p>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="h-3 overflow-hidden rounded-full bg-[#394554]">
        <div className="h-full rounded-full bg-[#61dd71]" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 text-right text-sm font-semibold text-[#102033]">{label}</p>
    </div>
  );
}

function EmptyPanelText({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-[#8ea4b5]">{text}</p>;
}

function buildMetrics(cases: WhatsAppKycCase[]) {
  return {
    total: cases.length,
    pending: cases.filter((caseItem) => !["approved", "rejected", "verified", "manual_review"].includes(caseItem.status)).length,
    approved: cases.filter((caseItem) => isApprovedCase(caseItem)).length,
    highRisk: cases.filter((caseItem) => riskLevel(caseItem) === "High").length,
  };
}

function buildRiskFactors(caseItem: WhatsAppKycCase) {
  const idValid = caseItem.verification.idValidation?.isValid ? 90 : caseItem.applicant.idNumber ? 55 : 20;
  const ocr = caseItem.verification.identityDocument?.ocrConfidence ? Math.round(caseItem.verification.identityDocument.ocrConfidence * 100) : 45;
  const proof = caseItem.verification.proofOfAddressDocument?.simulatedOcrScore
    ? Math.round(caseItem.verification.proofOfAddressDocument.simulatedOcrScore * 100)
    : caseItem.verification.digitalAffidavitProvided
      ? Math.round((caseItem.affidavit?.aiValidationScore ?? 0.74) * 100)
      : 40;
  const selfie = caseItem.verification.faceMatchScore ? Math.round(caseItem.verification.faceMatchScore * 100) : 0;
  const location = caseItem.verification.locationShared || caseItem.residenceEvidence?.gpsCoordinates ? 100 : caseItem.residenceEvidence?.towerId ? 70 : 0;
  return [
    { label: "ID checksum", score: idValid, color: riskColor(idValid), detail: caseItem.verification.idValidation?.isValid ? "Valid South African ID checksum." : "ID checksum requires review.", reason: caseItem.verification.idValidation?.isValid ? undefined : "ID validation incomplete" },
    { label: "OCR match", score: ocr, color: riskColor(ocr), detail: caseItem.verification.identityDocument?.matchedEnteredId === false ? "Uploaded ID does not match entered ID." : "Document OCR evidence captured.", reason: caseItem.verification.identityDocument?.matchedEnteredId === false ? "Document mismatch" : undefined },
    { label: "Proof / affidavit", score: proof, color: riskColor(proof), detail: caseItem.verification.proofOfAddressProvided || caseItem.verification.digitalAffidavitProvided ? "Residence evidence available." : "Proof or affidavit pending.", reason: proof < 70 ? "Residence evidence incomplete" : undefined },
    { label: "Selfie match", score: selfie, color: riskColor(selfie), detail: selfie ? "Selfie/liveness evidence captured." : "Selfie evidence pending.", reason: selfie ? undefined : "Biometric evidence pending" },
    { label: "GPS / tower", score: location, color: riskColor(location), detail: location >= 100 ? "GPS evidence captured." : location ? "Tower evidence captured; GPS preferred." : "GPS or tower evidence missing.", reason: location >= 100 ? undefined : "GPS evidence not complete" },
  ];
}

function riskColor(score: number) {
  if (score >= 80) return "#087f5b";
  if (score >= 60) return "#b76b00";
  return "#c2382b";
}

function getProofStatus(caseItem: WhatsAppKycCase): { label: string; status: "pass" | "review" } {
  const proof = caseItem.verification.proofOfAddressDocument;
  if (proof?.accepted) {
    const score = proof.simulatedOcrScore ? ` / ${Math.round(proof.simulatedOcrScore * 100)}%` : "";
    return { label: `Proof of address accepted${score}`, status: "pass" };
  }
  if (caseItem.affidavit) {
    const score = Math.round((caseItem.affidavit.aiValidationScore ?? 0.76) * 100);
    return { label: `Affidavit fallback captured / ${score}%`, status: "review" };
  }
  if (proof?.reviewReason) {
    return { label: `${proof.reviewReason} / affidavit review required`, status: "review" };
  }
  if (caseItem.verification.digitalAffidavitProvided) {
    return { label: "Digital affidavit captured", status: "review" };
  }
  if (caseItem.verification.proofOfAddressProvided) {
    return { label: "Proof of address captured for review", status: "review" };
  }
  return { label: "Proof of address pending", status: "review" };
}

function buildRiskDistribution(cases: WhatsAppKycCase[]) {
  const low = cases.filter((caseItem) => riskLevel(caseItem) === "Low").length;
  const medium = cases.filter((caseItem) => riskLevel(caseItem) === "Medium").length;
  const high = cases.filter((caseItem) => riskLevel(caseItem) === "High").length;
  return [
    { label: "Low", value: low, color: "#77dd49" },
    { label: "Medium", value: medium, color: "#ffc84a" },
    { label: "High", value: high, color: "#f15a3d" },
  ];
}

function buildDecisionDistribution(cases: WhatsAppKycCase[]) {
  const pass = cases.filter((caseItem) => isApprovedCase(caseItem)).length;
  const fail = cases.filter((caseItem) => isRejectedCase(caseItem)).length;
  const review = Math.max(0, cases.length - pass - fail);
  return [
    { label: "Pass", value: pass, color: "#26b86f" },
    { label: "Fail", value: fail, color: "#ef4444" },
    { label: "Review", value: review, color: "#ffc84a" },
  ];
}

function summarizeQueues(queue: QueueSnapshot) {
  return queue.queues.reduce(
    (summary, entry) => ({
      waiting: summary.waiting + Number(entry.counts.waiting ?? 0),
      active: summary.active + Number(entry.counts.active ?? 0),
      completed: summary.completed + Number(entry.counts.completed ?? 0),
      failed: summary.failed + Number(entry.counts.failed ?? 0),
    }),
    { waiting: 0, active: 0, completed: 0, failed: 0 }
  );
}

function matchesFilter(caseItem: WhatsAppKycCase, filter: FilterView) {
  if (filter === "all") return true;
  if (filter === "pending") return !["approved", "rejected", "verified", "manual_review"].includes(caseItem.status);
  if (filter === "approved") return isApprovedCase(caseItem);
  return riskLevel(caseItem) === "High";
}

function riskLevel(caseItem: WhatsAppKycCase) {
  const score = caseItem.risk?.score;
  const band = String(caseItem.risk?.band ?? "").toLowerCase();
  if (band.includes("high") || caseItem.status === "rejected" || (typeof score === "number" && score < 60)) return "High";
  if (band.includes("medium") || caseItem.status === "manual_review" || (typeof score === "number" && score < 82)) return "Medium";
  return "Low";
}

function isApprovedCase(caseItem: WhatsAppKycCase) {
  return caseItem.risk?.decision === "APPROVE" || caseItem.status === "approved" || caseItem.status === "verified";
}

function isRejectedCase(caseItem: WhatsAppKycCase) {
  return caseItem.risk?.decision === "REJECT" || caseItem.status === "rejected";
}

function friendlyStatus(caseItem: WhatsAppKycCase) {
  const latest = caseItem.auditTrail.at(-1)?.action;
  return latest ? humanizeAction(latest) : caseItem.status.replace(/_/g, " ");
}

function humanizeAction(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Otp", "OTP")
    .replace("Id", "ID");
}

function formatUtc(value?: string) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function formatTime(value?: string) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toISOString().slice(11, 16);
}

function buildDailyTrends(cases: WhatsAppKycCase[]) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    const dayCases = cases.filter((caseItem) => caseItem.createdAt.slice(0, 10) === key || caseItem.updatedAt.slice(0, 10) === key);
    return {
      label: key.slice(5),
      total: dayCases.length,
      approved: dayCases.filter(isApprovedCase).length,
    };
  });
}

function downloadCasesCsv(cases: WhatsAppKycCase[], fileName = "kyc-now-dashboard-cases.csv") {
  const header = ["caseReference", "msisdn", "provider", "status", "riskScore", "decision", "updatedAtUtc"];
  const rows = cases.map((caseItem) =>
    [
      caseItem.reference,
      caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber,
      caseItem.tenant,
      caseItem.status,
      caseItem.risk?.score ?? "",
      caseItem.risk?.decision ?? "review",
      caseItem.updatedAt,
    ].map(csvCell)
  );
  const blob = new Blob([[header, ...rows].map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadSponsorCsv(cases: WhatsAppKycCase[], batches: BulkBatch[], mode: ReportMode, fileName: string) {
  if (mode === "bulk") {
    downloadBulkCsv(batches, fileName);
    return;
  }

  const header = [
    "reportType",
    "caseReference",
    "msisdn",
    "provider",
    "applicant",
    "idNumber",
    "ficaRicaStatus",
    "riskScore",
    "decision",
    "proofStatus",
    "gpsCaptured",
    "towerId",
    "ipAddress",
    "deviceCaptured",
    "evidenceCompletenessPct",
    "updatedAtUtc",
  ];
  const rows = cases.map((caseItem) => {
    const proofStatus = getProofStatus(caseItem);
    return [
      "single_rica_fica",
      caseItem.reference,
      caseItem.applicant.phoneNumber ?? caseItem.staffInitiation.customerPhoneNumber,
      caseItem.tenant,
      caseItem.applicant.fullName ?? "",
      caseItem.applicant.idNumber ?? "",
      friendlyStatus(caseItem),
      caseItem.risk?.score ?? "",
      caseItem.risk?.decision ?? "review",
      proofStatus.label,
      caseItem.verification.locationShared || caseItem.residenceEvidence?.gpsCoordinates ? "yes" : "no",
      caseItem.residenceEvidence?.towerId ?? caseItem.geoCapture?.towerId ?? caseItem.staffInitiation.bulkCampaign?.towerId ?? "",
      caseItem.deviceIntelligence?.ipAddress ?? "",
      caseItem.deviceIntelligence?.browserFingerprint ? "yes" : "no",
      evidenceCompletenessPercent(caseItem),
      caseItem.updatedAt,
    ].map(csvCell);
  });
  downloadCsvRows(header, rows, fileName);
}

function downloadBulkCsv(batches: BulkBatch[], fileName: string) {
  const header = [
    "reportType",
    "batchReference",
    "provider",
    "sourceFileName",
    "batchStatus",
    "receivedAtUtc",
    "rowCount",
    "validCount",
    "errorCount",
    "rowNumber",
    "msisdn",
    "caseId",
    "rowStatus",
    "towerId",
    "locationEvidence",
  ];
  const rows = batches.flatMap((batch) => {
    const batchRows = Array.isArray(batch.rows) && batch.rows.length ? batch.rows : [null];
    return batchRows.map((row) =>
      [
        "bulk_campaign",
        batch.batchReference,
        batch.provider,
        batch.sourceFileName,
        batch.status,
        batch.receivedAt,
        batch.rowCount,
        batch.validCount,
        batch.errorCount,
        row?.rowNumber ?? "",
        row?.phoneNumber ?? "",
        row?.caseId ?? "",
        row?.status ?? "",
        row?.towerId ?? "",
        row?.locationEvidence ?? "",
      ].map(csvCell)
    );
  });
  downloadCsvRows(header, rows, fileName);
}

function downloadCsvRows(header: string[], rows: string[][], fileName: string) {
  const blob = new Blob([[header, ...rows].map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function evidenceCompletenessPercent(caseItem: WhatsAppKycCase) {
  const checks = [
    caseItem.verification.otp?.status === "verified",
    Boolean(caseItem.verification.identityDocument),
    Boolean(caseItem.verification.proofOfAddressProvided || caseItem.verification.digitalAffidavitProvided),
    Boolean(caseItem.verification.faceMatchScore),
    Boolean(caseItem.verification.locationShared || caseItem.residenceEvidence?.gpsCoordinates),
    Boolean(caseItem.deviceIntelligence?.browserFingerprint || caseItem.deviceIntelligence?.ipAddress),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}











