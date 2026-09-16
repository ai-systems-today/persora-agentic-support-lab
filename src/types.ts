export type EvidenceStatus =
  | "runtime-proven"
  | "repo-defined"
  | "fixture-replay"
  | "not-captured"
  | "not-executed";

export type Pattern = "sequential" | "concurrent" | "group-chat" | "handoff" | "magentic";

export type EvidenceField = {
  label: string;
  value: string;
  status: EvidenceStatus;
  detail: string;
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

