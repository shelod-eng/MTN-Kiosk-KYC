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

type DashboardPayload = {
  generatedAt: string;
  persistenceMode?: "supabase" | "memory";
  cases: WhatsAppKycCase[];
  bulkBatches: BulkBatch[];
  queue: QueueSnapshot;
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
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [lastRefreshError, setLastRefreshError] = useState("");

  useEffect(() => {
    void loadDashboard(true);
    const interval = window.setInterval(() => void loadDashboard(false), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  async function loadDashboard(showLoading: boolean) {
    if (showLoading) setLoading(true);
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
    <main className="min-h-screen bg-[#080d14] text-[#eef4f8]">
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#263240] pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-12 place-items-center rounded-md bg-[#1fb393] text-xl font-black text-[#06131a]">K</div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">KYC-Now Processing Dashboard</h1>
              <p className="mt-1 text-sm text-[#8ea4b5]">Unified case, batch, evidence, and audit analytics</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(["Sponsor", "MNO", "Admin"] as RoleView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setRoleView(view)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  roleView === view ? "border-[#56d39f] bg-[#123528] text-[#80f0b2]" : "border-[#2a3645] bg-[#111923] text-[#b7c6d1]"
                }`}
              >
                {view}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              className="rounded-md border border-[#2a3645] bg-[#111923] px-3 py-2 text-sm font-semibold text-[#b7c6d1]"
            >
              Refresh
            </button>
          </div>
        </header>

        {lastRefreshError && <p className="rounded-md border border-[#7f2d2d] bg-[#321316] px-4 py-3 text-sm text-[#ffb4a8]">{lastRefreshError}</p>}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Cases" value={String(metrics.total)} tone="blue" />
          <MetricCard label="Pending Verifications" value={String(metrics.pending)} tone="green" />
          <MetricCard label="Approved Cases" value={String(metrics.approved)} tone="amber" />
          <MetricCard label="High Risk Alerts" value={String(metrics.highRisk)} tone="red" />
        </section>

        {roleView === "Sponsor" && (
          <>
            <section className="grid min-w-0 gap-5 xl:grid-cols-[1.2fr_1fr_1.1fr]">
              <Panel title="Executive Case Outcomes" action={<CaseFilters active={filterView} onChange={setFilterView} />}>
                <CaseTable cases={visibleCases} selectedCaseId={selectedCase?.id ?? ""} onSelect={setSelectedCaseId} loading={loading} />
              </Panel>
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
                <SponsorExportPanel cases={visibleCases} generatedAt={payload.generatedAt} />
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
              <Panel title="Batch Queue">
                <BatchTable batches={payload.bulkBatches} selectedBatchId={selectedBatch?.id ?? ""} onSelect={setSelectedBatchId} />
              </Panel>
              <Panel title="Provider Performance">
                <ProviderPanel cases={sortedCases} batches={payload.bulkBatches} />
              </Panel>
            </section>
            <section className="grid min-w-0 gap-5 lg:grid-cols-[1.2fr_1fr]">
              <Panel title="MSISDN Row Outcomes">
                <MnoRowsPanel batch={selectedBatch} cases={sortedCases} />
              </Panel>
              <Panel title="Queue Status">
                <QueuePanel queue={payload.queue} />
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
    <section className="min-w-0 overflow-hidden rounded-md border border-[#222d3a] bg-[#111923] shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#2c3847] bg-[#202734] px-4">
        <h2 className="text-lg font-semibold text-[#f4f7fa]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" | "red" }) {
  const color = {
    blue: "text-[#8dd6ff]",
    green: "text-[#61dd71]",
    amber: "text-[#ffac66]",
    red: "text-[#ff745c]",
  }[tone];
  return (
    <div className="flex min-h-20 items-center justify-between rounded-md border border-[#263240] bg-[#202734] px-4 shadow-[0_14px_40px_rgba(0,0,0,0.25)]">
      <p className="text-base font-semibold text-white">{label}</p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
    </div>
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
      {batches.slice(0, 6).map((batch) => (
        <button
          key={batch.id}
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
        <div key={event.id} className="grid grid-cols-[72px_1fr] gap-3 border-b border-[#263240] pb-2 text-sm">
          <p className="font-mono text-[#e8f0f6]">{formatTime(event.timestamp)}</p>
          <div>
            <p className="font-semibold text-white">{humanizeAction(event.action)}</p>
            {roleView === "Admin" && <p className="mt-1 text-xs text-[#8ea4b5]">{event.actorRole} / {event.actorId}</p>}
          </div>
        </div>
      ))}
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
      <div className="flex h-40 items-end gap-6 overflow-hidden border-b border-[#334150] px-3">
        {riskDistribution.map((item) => (
          <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <p className="text-sm font-bold text-white">{item.value}</p>
            <div className="w-full rounded-t" style={{ height: `${Math.max(12, Math.round((item.value / maxRiskValue) * 96))}px`, background: item.color }} />
            <p className="text-sm font-semibold text-[#c9d4dd]">{item.label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_132px] sm:items-center">
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-white">Decisions</p>
          {decisionDistribution.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: item.color }} />
              <span className="text-[#c9d4dd]">{item.label}: {item.value}</span>
            </div>
          ))}
        </div>
        <div className="mx-auto grid size-32 place-items-center rounded-full" style={{ background: `conic-gradient(#26b86f 0 ${passPercent}%, #ef4444 ${passPercent}% 100%)` }}>
          <div className="grid size-20 place-items-center rounded-full bg-[#111923] text-center">
            <p className="text-2xl font-black text-white">{passPercent}%</p>
            <p className="text-xs text-[#c9d4dd]">Pass</p>
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
        <InfoLine label="Outcome" value={friendlyStatus(caseItem)} />
        <InfoLine label="RICA Proof" value={proofStatus.label} status={proofStatus.status} />
        <InfoLine label="Updated UTC" value={formatUtc(caseItem.updatedAt)} />
      </div>
    </div>
  );
}

function SponsorExportPanel({ cases, generatedAt }: { cases: WhatsAppKycCase[]; generatedAt: string }) {
  return (
    <div className="space-y-4 text-sm text-[#b8c8d4]">
      <p>Executive export includes case reference, MSISDN, provider, status, risk score, decision, and UTC update timestamp.</p>
      <InfoLine label="Rows Ready" value={String(cases.length)} />
      <InfoLine label="Snapshot UTC" value={formatUtc(generatedAt)} />
      <button type="button" onClick={() => downloadCasesCsv(cases)} className="rounded-md bg-[#28c989] px-4 py-2 text-sm font-bold text-[#071118]">
        Download Sponsor CSV
      </button>
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
          <div key={provider} className="rounded-md border border-[#263240] bg-[#0e151d] p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">{provider}</p>
              <p className="text-sm text-[#80f0b2]">{providerCases.length} cases</p>
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
  const rows = batch.rows.slice(0, 8);
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
              <tr key={row.id} className="border-b border-[#1d2834]">
                <td className="py-3 text-[#d8e2ea]">{row.rowNumber}</td>
                <td className="break-words py-3 text-white">{row.phoneNumber}</td>
                <td className="break-words py-3 text-[#ffd76a]">{caseItem ? friendlyStatus(caseItem) : row.status}</td>
                <td className="py-3 text-[#72e67d]">{caseItem?.risk?.score ?? "-"}</td>
                <td className="break-words py-3 text-[#9eb0bd]">{row.towerId || caseItem?.residenceEvidence?.towerId || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
        <div key={entry.key} className="rounded-md border border-[#263240] bg-[#0e151d] p-3">
          <p className="font-semibold text-white">{entry.name}</p>
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
    ["SA ID", Boolean(caseItem.verification.idValidation?.isValid)],
    ["ID OCR", Boolean(caseItem.verification.identityDocument)],
    ["Proof / affidavit", Boolean(caseItem.verification.proofOfAddressProvided || caseItem.verification.digitalAffidavitProvided)],
    ["Affidavit fallback", !caseItem.verification.proofOfAddressDocument?.reviewReason || Boolean(caseItem.affidavit)],
    ["Selfie", Boolean(caseItem.verification.livenessScore && caseItem.verification.faceMatchScore)],
    ["Location", Boolean(caseItem.verification.locationShared || caseItem.residenceEvidence?.towerId)],
  ] as const;
  return (
    <div className="grid gap-2">
      {checks.map(([label, done]) => (
        <div key={label} className="flex items-center justify-between rounded border border-[#273341] px-3 py-2 text-sm">
          <span className="text-[#d7e1e8]">{label}</span>
          <span className={done ? "text-[#72e67d]" : "text-[#ffd76a]"}>{done ? "Captured" : "Pending"}</span>
        </div>
      ))}
    </div>
  );
}

function getProofStatus(caseItem: WhatsAppKycCase): { label: string; status: "pass" | "review" } {
  const proof = caseItem.verification.proofOfAddressDocument;
  if (proof?.accepted) {
    return {
      label: `${proof.documentType} accepted / ${Math.round(proof.simulatedOcrScore * 100)}%`,
      status: "pass",
    };
  }

  if (proof?.reviewReason) {
    return {
      label: `${proof.documentType} needs RICA review / ${Math.round(proof.simulatedOcrScore * 100)}%`,
      status: "review",
    };
  }

  if (proof) {
    return {
      label: `${proof.documentType} pending review / ${Math.round(proof.simulatedOcrScore * 100)}%`,
      status: "review",
    };
  }

  if (caseItem.affidavit) {
    return {
      label: `Affidavit AI ${Math.round((caseItem.affidavit.aiValidationScore ?? 0) * 100)}%`,
      status: "review",
    };
  }

  return { label: "Pending", status: "review" };
}

function InfoLine({ label, value, strong, status }: { label: string; value: string; strong?: boolean; status?: "pass" | "review" }) {
  return (
    <div className="grid min-h-10 grid-cols-[112px_1fr] items-center gap-4 border-b border-[#263240] pb-2">
      <span className="text-[#c5d0d9]">{label}</span>
      <span className={`min-w-0 break-words text-right ${strong ? "font-black text-white" : "font-semibold text-[#eef4f8]"} ${status === "pass" ? "text-[#80f0b2]" : ""} ${status === "review" ? "text-[#ffd76a]" : ""}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-[#263240] bg-[#0e151d] p-3">
      <p className="text-xs text-[#9eb0bd]">{label}</p>
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
      <p className="mt-2 text-right text-sm font-semibold text-white">{label}</p>
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

function downloadCasesCsv(cases: WhatsAppKycCase[]) {
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
  anchor.download = "kyc-now-dashboard-cases.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
