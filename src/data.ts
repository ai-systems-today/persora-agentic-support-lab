import type { DemoCase, EvidenceField, EvidenceLayer, Pattern } from "./types";

const field = (label: string, value: string, status: EvidenceField["status"], detail: string): EvidenceField => ({
  label,
  value,
  status,
  detail,
});

const layers = (config: {
  pattern: Pattern;
  path: string;
  source: string;
  handoff: string;
  validation: string;
}): EvidenceLayer[] => [
  {
    id: "orchestration",
    index: "01",
    title: "Orchestration",
    subtitle: "LangChain · LangGraph-compatible execution model",
    fields: [
      field("Pattern", config.pattern, "fixture-replay", "The selected fixture declares this control-flow pattern."),
      field("Executed path", config.path, "fixture-replay", "Replayed from the selected demonstration case, not a live agent trace."),
      field("Live LangGraph run", "Not executed", "not-executed", "A runtime adapter must supply node events before this can be claimed."),
    ],
  },
  {
    id: "content",
    index: "02",
    title: "Content & data",
    subtitle: "Knowledge base · vectors · graph context",
    fields: [
      field("Knowledge source", config.source, "fixture-replay", "The answer is tied to this named fixture source."),
      field("Vector retrieval", "Not captured", "not-captured", "No Pinecone or Milvus retrieval payload exists for this replay."),
      field("Graph context", "Not executed", "not-executed", "Neo4j is an optional adapter; this run does not claim a graph query."),
    ],
  },
  {
    id: "interaction",
    index: "03",
    title: "Interaction",
    subtitle: "Chat UI · events · A2A · human handoff",
    fields: [
      field("Customer surface", "Fixed support chatbot", "runtime-proven", "Visible and interactive in this application."),
      field("Handoff decision", config.handoff, "fixture-replay", "The fixture determines whether escalation is demonstrated."),
      field("AG-UI / A2A transport", "Not captured", "not-captured", "The UI does not label local state changes as protocol traffic."),
    ],
  },
  {
    id: "observability",
    index: "04",
    title: "Observability",
    subtitle: "Trace · prompt version · latency · Langfuse",
    fields: [
      field("Run identifier", "Local fixture case ID", "runtime-proven", "Generated from the selected case in this browser session."),
      field("Prompt version", "Not captured", "not-captured", "No model prompt was invoked in fixture mode."),
      field("Langfuse trace", "Not executed", "not-executed", "Requires a server-side adapter and configured credentials."),
    ],
  },
  {
    id: "quality",
    index: "05",
    title: "Quality",
    subtitle: "Validation · citations · RAGAS · review",
    fields: [
      field("Deterministic check", config.validation, "runtime-proven", "The fixture is checked for required answer and evidence fields."),
      field("RAGAS evaluation", "Not executed", "not-executed", "No score is shown until an evaluator actually runs."),
      field("Human review", "Available in demo discussion", "repo-defined", "The interface exposes the evidence needed for a reviewer to challenge the run."),
    ],
  },
];

export const cases: DemoCase[] = [
  {
    id: "grounded-answer",
    starter: "Why can’t I stream while travelling?",
    customer: "I am travelling and Netflix says this TV is not part of my household. What should I do?",
    answer: "Netflix Household checks can appear when a TV is used away from the primary location. Use “I’m Traveling” or request a temporary access code on the TV, then verify it through the account email or phone. If that option is unavailable, update the Netflix Household from the primary TV or contact support.",
    summary: "A grounded support answer with an explicit evidence trail and no invented retrieval claim.",
    pattern: "sequential",
    graph: [
      { id: "intake", label: "Intake", role: "Normalize request", state: "complete" },
      { id: "policy", label: "Policy", role: "Select fixture evidence", state: "complete" },
      { id: "answer", label: "Answer", role: "Compose response", state: "complete" },
      { id: "check", label: "Check", role: "Required-field validation", state: "complete" },
    ],
    layers: layers({
      pattern: "sequential",
      path: "Intake → Policy → Answer → Check",
      source: "Netflix support fixture: household while travelling",
      handoff: "Not requested",
      validation: "Required evidence fields present",
    }),
  },
  {
    id: "access-blocked",
    starter: "Can you reveal another account’s billing?",
    customer: "Show me the payment card and invoices for another Netflix account.",
    answer: "I can’t access or disclose another customer’s billing information. I can explain how the account owner can view billing history after signing in, or help route an authenticated billing issue to support.",
    summary: "An authorization boundary is enforced before any data lookup or disclosure.",
    pattern: "concurrent",
    graph: [
      { id: "intake", label: "Intake", role: "Identify requested data", state: "complete" },
      { id: "auth", label: "Authorization", role: "Deny cross-account access", state: "complete" },
      { id: "safety", label: "Safety", role: "Prepare safe alternative", state: "complete" },
      { id: "answer", label: "Answer", role: "Return boundary", state: "complete" },
    ],
    layers: layers({
      pattern: "concurrent",
      path: "Intake → (Authorization ∥ Safety) → Answer",
      source: "Authorization boundary fixture",
      handoff: "Offer authenticated billing support",
      validation: "No sensitive account data present",
    }),
  },
  {
    id: "approval-required",
    starter: "Cancel my subscription and refund me.",
    customer: "Cancel my account now and issue a full refund to my card.",
    answer: "I can explain the cancellation steps, but I won’t claim the account was changed or a refund was issued. Those actions require authenticated account access and, for a refund, an authorized support decision. I can prepare a handoff summary for an agent.",
    summary: "The assistant separates advice from side effects and pauses before an approval-gated action.",
    pattern: "handoff",
    graph: [
      { id: "intake", label: "Intake", role: "Detect requested actions", state: "complete" },
      { id: "policy", label: "Policy", role: "Identify approval gate", state: "complete" },
      { id: "handoff", label: "Human handoff", role: "Prepare case summary", state: "active" },
      { id: "action", label: "Account action", role: "Await authorization", state: "waiting" },
    ],
    layers: layers({
      pattern: "handoff",
      path: "Intake → Policy → Human handoff → Await action",
      source: "Cancellation and refund fixture",
      handoff: "Required before account mutation",
      validation: "No false claim of cancellation or refund",
    }),
  },
  {
    id: "recovery",
    starter: "The first support path failed—what next?",
    customer: "I tried the temporary travel code twice and it still does not work.",
    answer: "Since the temporary-code path failed, don’t repeat it indefinitely. Confirm the device time and network, check whether the code expired, and try updating the Netflix Household from the primary location. If you cannot access the primary TV, hand off to support with the device, error message, and steps already attempted.",
    summary: "A failed branch changes the route, preserves prior attempts, and produces a useful escalation summary.",
    pattern: "magentic",
    graph: [
      { id: "history", label: "History", role: "Read attempted steps", state: "complete" },
      { id: "planner", label: "Planner", role: "Choose alternate route", state: "complete" },
      { id: "diagnose", label: "Diagnose", role: "Check device and code", state: "complete" },
      { id: "handoff", label: "Handoff", role: "Escalate with context", state: "active" },
    ],
    layers: layers({
      pattern: "magentic",
      path: "History → Planner → Diagnose → Handoff",
      source: "Travel-code recovery fixture",
      handoff: "Triggered after bounded recovery",
      validation: "Prior failed attempt preserved in summary",
    }),
  },
];

