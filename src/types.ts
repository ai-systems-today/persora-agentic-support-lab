export type EvidenceStatus =
  | "runtime-proven"
  | "repo-defined"
  | "fixture-replay"
  | "not-captured"
  | "not-executed"
  | "not-evaluated";

export type Pattern = "sequential" | "concurrent" | "group-chat" | "handoff" | "magentic";

export type EvidenceField = {
  label: string;
  value: string;
  href?: string;
  status: EvidenceStatus;
  detail: string;
  metrics?: Array<{ label: string; value: string }>;
};

export type EvidenceLayer = {
  id: "orchestration" | "content" | "interaction" | "observability" | "quality";
  index: string;
  title: string;
  subtitle: string;
  fields: EvidenceField[];
};

export type GraphNode = {
  id: string;
  label: string;
  role: string;
  state: "complete" | "active" | "waiting" | "skipped";
  kind?: "customer" | "orchestrator" | "agent" | "knowledge" | "human" | "quality";
};

export type DemoCase = {
  id: string;
  starter: string;
  customer: string;
  answer: string;
  summary: string;
  pattern: Pattern;
  graph: GraphNode[];
  layers: EvidenceLayer[];
};

export type Citation = {
  label: string;
  url: string | null;
  snippet: string | null;
  similarity: number | null;
};

export type SpecialistEvidence = {
  domain: "billing" | "household" | "identity" | "general";
  agentId: string;
  agentName: string;
  widgetId: string;
};

export type RuntimeEvidence = {
  mode: "agentic" | "live" | "fixture";
  transport: "json" | "sse" | "local";
  traceId: string;
  totalMs: number;
  eventTypes: string[];
  citations: Citation[];
  error: string | null;
  pattern?: Pattern;
  specialist?: SpecialistEvidence | null;
  routing?: {
    strategy: "deterministic-policy-router";
    reason: string;
    signals: string[];
    confidence: number;
  };
  promptVersion?: string;
  guardrail?: { decision: "allow" | "block"; reason: string };
  nodeTrace?: Array<{ node: string; status: string; durationMs: number }>;
  publicTrace?: {
    schemaVersion: "1.0";
    generatedAt: string;
    nodeCount: number;
    protocolEventCount: number;
    citationCount: number;
    privateObservabilityExported: boolean;
  };
  protocolEvents?: Array<Record<string, unknown> & { type: string }>;
  quality?: {
    executed: boolean;
    method: "deterministic-grounding-v3";
    status: "passed" | "failed" | "not-evaluated";
    grounding: number | null;
    citationValidity: number | null;
    answerRelevance: number | null;
    intentCoverage: number | null;
    correctness: null;
    claimCount: number;
    supportedClaimCount: number;
    referencedCitationCount: number;
    validCitationCount: number;
    requiredIntentCount: number;
    coveredIntentCount: number;
    retryCount: number;
    reason: string;
  };
  orchestrationProof?: {
    concurrent: {
      executed: boolean;
      checks: Array<{
        name: string;
        startedAtMs: number;
        finishedAtMs: number;
        durationMs: number;
        result: string;
      }>;
      overlapMs: number;
      proved: boolean;
    } | null;
    recovery: {
      executed: boolean;
      maxIterations: number;
      iterations: Array<{ attempt: number; decision: "revise" | "finish"; reason: string }>;
      revised: boolean;
    } | null;
  };
  followUps?: string[];
  retrieval?: {
    provider: string;
    returnedCount: number;
    durationMs: number | null;
    results: Array<{
      rank: number;
      label: string;
      url: string | null;
      snippet: string | null;
      similarity: number | null;
    }>;
  };
  handoff?: {
    required: boolean;
    status: "not-required" | "awaiting-human" | "approved" | "rejected";
    summary: string | null;
    approvalId?: string | null;
    decidedAt?: string | null;
    decisionMessage?: string | null;
  };
  integrations?: {
    langGraph: { executed: boolean; version: string };
    langfuse: {
      configured: boolean;
      executed: boolean;
      traceId: string | null;
      traceUrl: string | null;
      error: string | null;
      readback: "available" | "pending" | "failed" | "not-attempted";
      observations: Array<{
        name: string;
        type: string;
        status: string | null;
        durationMs: number | null;
        inputTokens: number | null;
        outputTokens: number | null;
        totalCost: number | null;
      }>;
      readbackToken: string | null;
    };
    ragas: {
      executed: boolean;
      scope: "benchmark" | "request" | null;
      version: string | null;
      sampleCount: number | null;
      scores: Record<string, number> | null;
      cases?: Record<string, { question: string; scores: Record<string, number> }>;
    };
    agUi: { executed: boolean; version: string; eventCount: number };
    a2a: {
      executed: boolean;
      version: string;
      agentName: string | null;
      taskId: string | null;
      specialists: SpecialistEvidence[];
      error: string | null;
    };
    neo4j: { executed: boolean; records: number | null };
  };
};

export type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  runId: string | null;
  createdAt: string;
  demoCase: DemoCase | null;
  ragasCaseId: string | null;
  runtime: RuntimeEvidence;
};

export type RunProgress = {
  traceId: string;
  stage: string;
  label: string;
  status: "running" | "complete";
  startedAt: number;
  events: Array<Record<string, unknown> & { type: string }>;
};
