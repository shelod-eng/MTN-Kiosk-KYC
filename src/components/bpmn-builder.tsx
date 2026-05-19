'use client';

import { useEffect, useRef, useState } from "react";
import { defaultBpmnXml } from "@/lib/bpmn-default";

type ModelerLike = {
  importXML: (xml: string) => Promise<unknown>;
  saveXML: (options?: { format?: boolean }) => Promise<{ xml?: string }>;
  get: (name: "canvas") => { zoom: (value: string, padding?: string) => void };
  on: (eventName: string, handler: () => void | Promise<void>) => void;
  destroy: () => void;
};

type ExecutionResponse = {
  decision: string;
  variables: Record<string, unknown>;
  trace: Array<{
    nodeId: string;
    nodeName: string;
    type: string;
    result?: Record<string, unknown>;
  }>;
};

export function BpmnBuilder() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modelerRef = useRef<ModelerLike | null>(null);
  const [xml, setXml] = useState(defaultBpmnXml);
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [payload, setPayload] = useState({
    applicantName: "Lebo Mpeta",
    idNumber: "9201055800087",
    liveness: "0.82",
  });

  useEffect(() => {
    let disposed = false;

    async function boot() {
      const Modeler = (await import("bpmn-js/lib/Modeler")).default;

      if (!containerRef.current || disposed) return;

      const modeler = new Modeler({
        container: containerRef.current,
        keyboard: { bindTo: document },
      }) as unknown as ModelerLike;

      modelerRef.current = modeler;
      await modeler.importXML(defaultBpmnXml);
      modeler.get("canvas").zoom("fit-viewport", "auto");

      modeler.on("commandStack.changed", async () => {
        const result = await modeler.saveXML({ format: true });
        setXml(result.xml ?? defaultBpmnXml);
      });

      setIsReady(true);
    }

    void boot();

    return () => {
      disposed = true;
      modelerRef.current?.destroy();
      modelerRef.current = null;
    };
  }, []);

  async function runWorkflow() {
    setIsRunning(true);
    setExecution(null);

    try {
      const response = await fetch("/api/workflow/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          context: {
            applicantName: payload.applicantName,
            idNumber: payload.idNumber,
            liveness: Number(payload.liveness),
          },
        }),
      });

      const result = (await response.json()) as ExecutionResponse;
      setExecution(result);
    } finally {
      setIsRunning(false);
    }
  }

  async function resetDiagram() {
    const modeler = modelerRef.current;
    if (!modeler) return;
    await modeler.importXML(defaultBpmnXml);
    setXml(defaultBpmnXml);
    setExecution(null);
  }

  return (
    <section className="rounded-[2rem] border border-[#d7e2ee] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b8ea6]">Workflow Builder</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#112a43]">Drag-and-drop BPMN designer</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64788f]">
            Build the KYC path on canvas, then execute it through the local workflow API. Service tasks can represent OCR, DHA, selfie verification, TransUnion, Experian, and risk decisioning.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={resetDiagram} className="rounded-full border border-[#cbd8e4] px-4 py-2 text-sm font-medium text-[#29445d]">
            Reset Diagram
          </button>
          <button type="button" onClick={runWorkflow} disabled={!isReady || isRunning} className="rounded-full bg-[#0f2f3a] px-5 py-2 text-sm font-semibold text-white disabled:bg-[#8ca1b6]">
            {isRunning ? "Running..." : "Execute Workflow"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[1.5rem] border border-[#d9e4ee] bg-[#fbfdff] p-3">
          <div ref={containerRef} className="bpmn-canvas h-[620px] overflow-hidden rounded-[1rem] border border-[#d7e2ee] bg-white" />
        </div>

        <div className="space-y-5">
          <section className="rounded-[1.5rem] border border-[#d7e2ee] bg-[#f9fcff] p-4">
            <h3 className="text-lg font-semibold text-[#17324a]">Execution payload</h3>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#29445d]">Applicant name</span>
                <input
                  value={payload.applicantName}
                  onChange={(event) => setPayload((current) => ({ ...current, applicantName: event.target.value }))}
                  className="w-full rounded-2xl border border-[#cbd8e4] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#29445d]">ID number</span>
                <input
                  value={payload.idNumber}
                  onChange={(event) => setPayload((current) => ({ ...current, idNumber: event.target.value }))}
                  className="w-full rounded-2xl border border-[#cbd8e4] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#29445d]">Liveness override</span>
                <input
                  value={payload.liveness}
                  onChange={(event) => setPayload((current) => ({ ...current, liveness: event.target.value }))}
                  className="w-full rounded-2xl border border-[#cbd8e4] px-4 py-3 text-sm outline-none focus:border-[#53718f]"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[#d7e2ee] bg-[#f9fcff] p-4">
            <h3 className="text-lg font-semibold text-[#17324a]">Execution trace</h3>
            {execution ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-[#dce7f0] bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-[#7b8ea6]">Final Decision</p>
                  <p className="mt-2 text-2xl font-semibold text-[#112a43]">{execution.decision}</p>
                </div>
                {execution.trace.map((item) => (
                  <article key={`${item.nodeId}-${item.nodeName}`} className="rounded-2xl border border-[#dce7f0] bg-white px-4 py-3">
                    <p className="font-semibold text-[#17324a]">{item.nodeName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#8aa0b3]">{item.type}</p>
                    {item.result && (
                      <pre className="mt-3 overflow-x-auto rounded-xl bg-[#f5f9fc] p-3 text-xs text-[#30506a]">
                        {JSON.stringify(item.result, null, 2)}
                      </pre>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[#64788f]">Execute the diagram to see each task run through the local KYC workflow engine.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
