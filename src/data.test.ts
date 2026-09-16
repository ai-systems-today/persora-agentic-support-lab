import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cases } from "./data";

describe("demo evidence", () => {
  it("provides five distinct cases", () => {
    expect(cases).toHaveLength(5);
    expect(new Set(cases.map((item) => item.answer)).size).toBe(5);
    expect(cases.map((item) => item.pattern)).toContain("group-chat");
  });

  it("provides all five evidence layers for every case", () => {
    for (const item of cases) {
      expect(item.layers.map((layer) => layer.id)).toEqual([
        "orchestration",
        "content",
        "interaction",
        "observability",
        "quality",
      ]);
    }
  });

  it("does not claim optional integrations executed in fixture mode", () => {
    const optional = cases.flatMap((item) => item.layers).flatMap((layer) => layer.fields)
      .filter((entry) => /LangGraph|Pinecone|Milvus|Neo4j|AG-UI|A2A|Langfuse|RAGAS/i.test(`${entry.label} ${entry.value} ${entry.detail}`));
    expect(optional.length).toBeGreaterThan(0);
    expect(optional.every((entry) => entry.status === "not-captured" || entry.status === "not-executed")).toBe(true);
  });

  it("keeps Langfuse proof conditional on an accepted OTLP export", () => {
    const source = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    expect(source).toContain("/api/public/otel/v1/traces");
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("configured: false, executed: false");
    expect(source).toMatch(/configured:\s*true,\s*executed:\s*true/);
  });
});
