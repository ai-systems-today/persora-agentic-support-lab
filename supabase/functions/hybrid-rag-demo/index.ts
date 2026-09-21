import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import neo4j from "npm:neo4j-driver@5.28.2";
import { consumeEntryRateLimit, requestRateLimitKey } from "../_shared/entryRateLimit.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ai-systems-today.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const TOPIC_RULES: ReadonlyArray<{ topic: string; terms: RegExp }> = [
  { topic: "Netflix Household", terms: /household|primary location/i },
  { topic: "Travel", terms: /travel|travelling|temporary access|hotel/i },
  { topic: "Verification", terms: /verification|verify|code/i },
  { topic: "Television", terms: /\bTV\b|television|smart tv/i },
  { topic: "Mobile device", terms: /mobile|phone|tablet|android|iphone|ipad/i },
  { topic: "Account access", terms: /sign[ -]?in|password|email access|account access/i },
  { topic: "Billing", terms: /bill|payment|charge|invoice/i },
  { topic: "Cancellation", terms: /cancel|refund/i },
  { topic: "Downloads", terms: /download|offline/i },
  { topic: "Profiles", terms: /profile|maturity|pin/i },
  { topic: "Plans", terms: /subscription|plan|premium|standard/i },
];

type Evidence = {
  backend: "azure-openai" | "pinecone" | "neo4j";
  executed: boolean;
  durationMs: number;
  records: number;
  error: string | null;
};
type VectorMatch = { id: string; score: number; content: string; title: string | null; sourceUrl: string | null };
type GraphFact = { from: string; relationship: string; to: string; sourceChunkIds: string[]; sourceUrls: string[] };

const PINECONE_NAMESPACE = "netflix-support-v1";

const netflixSourceUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "netflix.com" || url.hostname.endsWith(".netflix.com")) ? url.href : null;
  } catch {
    return null;
  }
};

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (origin: string, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
};

const publicError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Backend request failed";
  const status = message.match(/HTTP (\d{3})/)?.[1];
  return status ? `Provider returned HTTP ${status}` : message.startsWith("Missing required server configuration:") ? message : "Backend request failed";
};

async function measured<T>(
  backend: Evidence["backend"],
  operation: () => Promise<T[]>,
): Promise<{ values: T[]; evidence: Evidence }> {
  const started = performance.now();
  try {
    const values = await operation();
    return {
      values,
      evidence: { backend, executed: true, durationMs: Math.round(performance.now() - started), records: values.length, error: null },
    };
  } catch (error) {
    return {
      values: [],
      evidence: { backend, executed: false, durationMs: Math.round(performance.now() - started), records: 0, error: publicError(error) },
    };
  }
}

async function embed(question: string): Promise<number[]> {
  const endpoint = required("AZURE_OPENAI_ENDPOINT").replace(/\/$/, "");
  const deployment = encodeURIComponent(Deno.env.get("AZURE_OPENAI_EMBED_DEPLOYMENT")?.trim() || "text-embedding-3-small");
  const apiVersion = encodeURIComponent(Deno.env.get("AZURE_OPENAI_API_VERSION")?.trim() || "2024-02-15-preview");
  const response = await fetch(`${endpoint}/openai/deployments/${deployment}/embeddings?api-version=${apiVersion}`, {
    method: "POST",
    headers: { "api-key": required("AZURE_OPENAI_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ input: question }),
  });
  if (!response.ok) throw new Error(`Azure embedding failed with HTTP ${response.status}`);
  const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
  const vector = payload.data?.[0]?.embedding;
  if (!vector || vector.length !== 1536) throw new Error("Azure embedding did not return 1,536 dimensions");
  return vector;
}

async function queryPinecone(vector: number[]): Promise<VectorMatch[]> {
  const host = required("PINECONE_INDEX_HOST").replace(/\/$/, "");
  const response = await fetch(`${host}/query`, {
    method: "POST",
    headers: {
      "Api-Key": required("PINECONE_API_KEY"),
      "Content-Type": "application/json",
      "X-Pinecone-Api-Version": "2025-01",
    },
    body: JSON.stringify({
      namespace: PINECONE_NAMESPACE,
      vector,
      topK: 8,
      includeMetadata: true,
      includeValues: false,
    }),
  });
  if (!response.ok) throw new Error(`Pinecone query failed with HTTP ${response.status}`);
  const payload = await response.json() as { matches?: Array<{ id?: unknown; score?: unknown; metadata?: Record<string, unknown> }> };
  return (payload.matches ?? []).flatMap((match) => {
    if (typeof match.id !== "string") return [];
    const metadata = match.metadata ?? {};
    return [{
      id: match.id,
      score: typeof match.score === "number" ? match.score : 0,
      content: typeof metadata.content === "string" ? metadata.content : "",
      title: typeof metadata.title === "string" && metadata.title ? metadata.title : null,
      sourceUrl: netflixSourceUrl(metadata.sourceUrl),
    }];
  });
}

const topicsForText = (text: string) => TOPIC_RULES.filter(({ terms }) => terms.test(text)).map(({ topic }) => topic);

async function queryNeo4j(topics: string[]): Promise<GraphFact[]> {
  if (!topics.length) return [];
  const username = Deno.env.get("NEO4J_USERNAME")?.trim() || "neo4j";
  const driver = neo4j.driver(required("NEO4J_URI"), neo4j.auth.basic(username, required("NEO4J_PASSWORD")));
  try {
    const result = await driver.executeQuery(
      `MATCH (from:Topic)-[r:RELATED]->(to:Topic)
        WHERE from.name IN $topics OR to.name IN $topics
        RETURN from.name AS from, r.kind AS relationship, to.name AS to,
               r.sourceChunkIds AS sourceChunkIds, r.sourceUrls AS sourceUrls
        LIMIT 20`,
      { topics },
    );
    return result.records.flatMap((record) => {
      const from = record.get("from");
      const relationship = record.get("relationship");
      const to = record.get("to");
      if (typeof from !== "string" || typeof relationship !== "string" || typeof to !== "string") return [];
      const sourceChunkIds = record.get("sourceChunkIds");
      const sourceUrls = record.get("sourceUrls");
      return [{
        from,
        relationship,
        to,
        sourceChunkIds: Array.isArray(sourceChunkIds) ? sourceChunkIds.filter((value): value is string => typeof value === "string") : [],
        sourceUrls: Array.isArray(sourceUrls) ? sourceUrls.flatMap((value) => netflixSourceUrl(value) ?? []) : [],
      }];
    });
  } finally {
    await driver.close();
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed" }, 405);

  const started = performance.now();
  const runId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  try {
    const bodyValue: unknown = await req.json();
    if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) return json(origin, { error: "Request body must be a JSON object" }, 400);
    const body = bodyValue as Record<string, unknown>;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : crypto.randomUUID();
    if (!question || question.length > 1000) return json(origin, { error: "Question must contain 1–1,000 characters" }, 400);

    const rateLimit = consumeEntryRateLimit(await requestRateLimitKey(req, "hybrid-rag-demo", sessionToken));
    if (!rateLimit.allowed) return json(origin, { error: "Too many requests" }, 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });

    const embedding = await measured<number[]>("azure-openai", async () => [await embed(question)]);
    if (!embedding.evidence.executed || !embedding.values[0]) {
      return json(origin, {
        runId,
        question,
        vectorMatches: [],
        graphFacts: [],
        evidence: [embedding.evidence],
        totalMs: Math.round(performance.now() - started),
        error: "Query embedding failed; retrieval was not executed.",
      }, 502);
    }

    const pinecone = await measured<VectorMatch>("pinecone", () => queryPinecone(embedding.values[0]));
    const topicText = `${question}\n${pinecone.values.map((match) => `${match.title ?? ""}\n${match.content}`).join("\n")}`;
    const topics = topicsForText(topicText);
    const neo4j = topics.length
      ? await measured<GraphFact>("neo4j", () => queryNeo4j(topics))
      : { values: [] as GraphFact[], evidence: { backend: "neo4j" as const, executed: false, durationMs: 0, records: 0, error: "No bounded graph topic matched this request" } };

    return json(origin, {
      runId,
      question,
      vectorMatches: pinecone.values,
      graphFacts: neo4j.values,
      evidence: [embedding.evidence, pinecone.evidence, neo4j.evidence],
      totalMs: Math.round(performance.now() - started),
      error: null,
    });
  } catch (error) {
    console.error(JSON.stringify({ runId, function: "hybrid-rag-demo", error: error instanceof Error ? error.message : "unknown" }));
    return json(origin, { error: "Hybrid retrieval failed", runId }, 500);
  }
});
