'use client';

import { useState } from "react";
import { computeDecision, type RiskBand } from "@/lib/mock-data";

type SimulatorState = {
  fullName: string;
  channel: "WhatsApp" | "Kiosk";
  dhaVerified: boolean;
  ocrConfidence: number;
  transunionScore: number;
  experianBand: RiskBand;
  liveness: number;
};

const defaultState: SimulatorState = {
  fullName: "Lebo Molefe",
  channel: "WhatsApp",
  dhaVerified: true,
  ocrConfidence: 87,
  transunionScore: 520,
  experianBand: "medium",
  liveness: 0.79,
};

export function SessionSimulator() {
  const [state, setState] = useState(defaultState);
  const decision = computeDecision(state);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#08141f]/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Session simulator</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Prototype the DMN outcome</h3>
          <p className="mt-2 max-w-xl text-sm text-slate-300">
            Adjust the mock KYC signals below to see how the approve, review, or reject policy reacts.
          </p>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${decisionTone(decision)}`}>
          {decision}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Applicant name</span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
            value={state.fullName}
            onChange={(event) => setState((current) => ({ ...current, fullName: event.target.value }))}
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm text-slate-300">Channel</span>
          <select
            className="w-full rounded-2xl border border-white/10 bg-[#102233] px-4 py-3 text-white outline-none transition focus:border-cyan-300"
            value={state.channel}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                channel: event.target.value as "WhatsApp" | "Kiosk",
              }))
            }
          >
            <option>WhatsApp</option>
            <option>Kiosk</option>
          </select>
        </label>

        <SliderField
          label="OCR confidence"
          min={60}
          max={100}
          step={1}
          value={state.ocrConfidence}
          suffix="%"
          onChange={(value) => setState((current) => ({ ...current, ocrConfidence: value }))}
        />

        <SliderField
          label="Liveness score"
          min={0.5}
          max={1}
          step={0.01}
          value={state.liveness}
          suffix=""
          onChange={(value) => setState((current) => ({ ...current, liveness: value }))}
        />

        <SliderField
          label="TransUnion fraud score"
          min={250}
          max={900}
          step={1}
          value={state.transunionScore}
          suffix=""
          onChange={(value) => setState((current) => ({ ...current, transunionScore: value }))}
        />

        <label className="space-y-2">
          <span className="text-sm text-slate-300">Experian risk band</span>
          <select
            className="w-full rounded-2xl border border-white/10 bg-[#102233] px-4 py-3 text-white outline-none transition focus:border-cyan-300"
            value={state.experianBand}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                experianBand: event.target.value as "low" | "medium" | "high",
              }))
            }
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
            state.dhaVerified
              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
              : "border-rose-300/40 bg-rose-400/10 text-rose-200"
          }`}
          onClick={() => setState((current) => ({ ...current, dhaVerified: !current.dhaVerified }))}
        >
          DHA verified: {state.dhaVerified ? "true" : "false"}
        </button>

        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          onClick={() => setState(defaultState)}
        >
          Reset scenario
        </button>
      </div>
    </section>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="flex items-center justify-between text-sm text-slate-300">
        {label}
        <strong className="font-mono text-cyan-100">
          {value}
          {suffix}
        </strong>
      </span>
      <input
        className="w-full accent-cyan-300"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function decisionTone(decision: string) {
  if (decision === "APPROVE") return "bg-emerald-400/15 text-emerald-200";
  if (decision === "REJECT") return "bg-rose-400/15 text-rose-200";
  return "bg-amber-400/15 text-amber-200";
}
