import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { computeDecision, deriveSignalsFromId, type Decision, type RiskBand } from "@/lib/mock-data";

type FlowNode = {
  id: string;
  name: string;
  kind: string;
  outgoing: string[];
};

type SequenceFlow = {
  id: string;
  sourceRef: string;
  targetRef: string;
  condition?: string;
};

type WorkflowContext = {
  applicantName?: string;
  idNumber?: string;
  liveness?: number;
};

export async function POST(request: NextRequest) {
  const { xml, context } = (await request.json()) as { xml?: string; context?: WorkflowContext };

  if (!xml) {
    return NextResponse.json({ error: "Missing BPMN XML." }, { status: 400 });
  }

  try {
    const execution = runWorkflow(xml, context ?? {});
    return NextResponse.json(execution);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workflow execution failed." },
      { status: 500 }
    );
  }
}

function runWorkflow(xml: string, context: WorkflowContext) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
  });

  const parsed = parser.parse(xml);
  const definitions = parsed["bpmn:definitions"] ?? parsed.definitions;
  const process = definitions?.["bpmn:process"] ?? definitions?.process;

  if (!process) {
    throw new Error("No BPMN process definition found.");
  }

  const sequenceFlows = normalizeSequenceFlows(process);
  const nodes = normalizeNodes(process);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const flowMap = new Map(sequenceFlows.map((flow) => [flow.id, flow]));
  const startNode = nodes.find((node) => node.kind.includes("startEvent"));

  if (!startNode) {
    throw new Error("The BPMN process has no start event.");
  }

  const baseSignals = deriveSignalsFromId(context.idNumber ?? "9201055800087");
  const variables: Record<string, unknown> = {
    applicantName: context.applicantName ?? "Demo Applicant",
    idNumber: context.idNumber ?? "9201055800087",
    ocrConfidence: baseSignals.ocrConfidence,
    liveness: context.liveness ?? baseSignals.liveness,
    dhaVerified: baseSignals.dhaVerified,
    transunionScore: baseSignals.transunionScore,
    experianBand: baseSignals.experianBand,
    addressVerified: true,
  };

  const trace: Array<{ nodeId: string; nodeName: string; type: string; result?: Record<string, unknown> }> = [];

  let currentNode: FlowNode | undefined = startNode;

  while (currentNode) {
    if (!currentNode.kind.includes("startEvent")) {
      const result = executeNode(currentNode, variables);
      trace.push({
        nodeId: currentNode.id,
        nodeName: currentNode.name,
        type: currentNode.kind,
        result,
      });
    }

    if (currentNode.kind.includes("endEvent")) {
      break;
    }

    const nextFlowId = pickNextFlow(currentNode, flowMap, variables);
    if (!nextFlowId) break;
    const nextFlow = flowMap.get(nextFlowId);
    currentNode = nextFlow ? nodeMap.get(nextFlow.targetRef) : undefined;
  }

  return {
    decision: String(variables.decision ?? "REVIEW") as Decision,
    variables,
    trace,
  };
}

function executeNode(node: FlowNode, variables: Record<string, unknown>) {
  const idNumber = String(variables.idNumber ?? "9201055800087");
  const derived = deriveSignalsFromId(idNumber);
  const taskName = `${node.name} ${node.id}`.toLowerCase();
  let result: Record<string, unknown> = {};

  if (taskName.includes("personal")) {
    result = { captured: true, applicantName: variables.applicantName };
  } else if (taskName.includes("ocr")) {
    variables.ocrConfidence = derived.ocrConfidence;
    result = { ocrConfidence: derived.ocrConfidence };
  } else if (taskName.includes("selfie")) {
    const liveness = Number(variables.liveness ?? derived.liveness);
    variables.liveness = liveness;
    result = {
      liveness,
      passed: liveness >= 0.75,
    };
  } else if (taskName.includes("proof")) {
    variables.addressVerified = true;
    result = { addressVerified: true };
  } else if (taskName.includes("dha")) {
    variables.dhaVerified = derived.dhaVerified;
    result = { dhaVerified: derived.dhaVerified };
  } else if (taskName.includes("transunion")) {
    variables.transunionScore = derived.transunionScore;
    result = { transunionScore: derived.transunionScore };
  } else if (taskName.includes("experian")) {
    variables.experianBand = derived.experianBand;
    result = { experianBand: derived.experianBand };
  } else if (taskName.includes("risk")) {
    const decision = computeDecision({
      dhaVerified: Boolean(variables.dhaVerified),
      ocrConfidence: Number(variables.ocrConfidence),
      transunionScore: Number(variables.transunionScore),
      experianBand: String(variables.experianBand) as RiskBand,
      liveness: Number(variables.liveness),
    });
    variables.decision = decision;
    result = { decision };
  }

  return result;
}

function pickNextFlow(
  node: FlowNode,
  flowMap: Map<string, SequenceFlow>,
  variables: Record<string, unknown>
) {
  if (node.kind.includes("exclusiveGateway")) {
    for (const outgoingId of node.outgoing) {
      const flow = flowMap.get(outgoingId);
      if (flow?.condition && evaluateCondition(flow.condition, variables)) {
        return flow.id;
      }
    }
  }

  return node.outgoing[0];
}

function evaluateCondition(expression: string, variables: Record<string, unknown>) {
  const match = expression.match(/\$\{\s*(\w+)\s*===\s*'([^']+)'\s*\}/);
  if (!match) return false;
  const [, variableName, expected] = match;
  return String(variables[variableName]) === expected;
}

function normalizeNodes(process: Record<string, unknown>) {
  const elementKeys = [
    "bpmn:startEvent",
    "bpmn:userTask",
    "bpmn:serviceTask",
    "bpmn:scriptTask",
    "bpmn:exclusiveGateway",
    "bpmn:endEvent",
    "startEvent",
    "userTask",
    "serviceTask",
    "scriptTask",
    "exclusiveGateway",
    "endEvent",
  ];

  const nodes: FlowNode[] = [];

  for (const key of elementKeys) {
    const entries = toArray<Record<string, unknown>>(process[key as keyof typeof process] as Record<string, unknown> | Record<string, unknown>[] | undefined);
    for (const entry of entries) {
      nodes.push({
        id: String(entry.id),
        name: String(entry.name ?? entry.id),
        kind: key,
        outgoing: toArray<string>(
          (entry["bpmn:outgoing"] ?? entry.outgoing) as string | string[] | undefined
        ).map(String),
      });
    }
  }

  return nodes;
}

function normalizeSequenceFlows(process: Record<string, unknown>) {
  const flows = toArray<Record<string, unknown>>(
    (process["bpmn:sequenceFlow"] ?? process.sequenceFlow) as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined
  );
  return flows.map((flow) => ({
    id: String(flow.id),
    sourceRef: String(flow.sourceRef),
    targetRef: String(flow.targetRef),
    condition: readCondition(flow),
  }));
}

function readCondition(flow: Record<string, unknown>) {
  const raw = flow["bpmn:conditionExpression"] ?? flow.conditionExpression;
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "#text" in raw) {
    return String(raw["#text"]);
  }
  return undefined;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
