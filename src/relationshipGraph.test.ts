import { describe, expect, it } from "vitest";
import { buildRelationshipGraph } from "./relationshipGraph";

describe("buildRelationshipGraph", () => {
  it("deduplicates nodes and maps exact-run facts to edges", () => {
    const graph = buildRelationshipGraph([
      { from: "Travel", relationship: "MAY_REQUIRE", to: "Verification", sourceChunkIds: ["one"], sourceUrls: [] },
      { from: "Netflix Household", relationship: "AFFECTS_WHILE", to: "Travel", sourceChunkIds: ["two"], sourceUrls: ["https://help.netflix.com/en/node/128339"] },
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual(["Netflix Household", "Travel", "Verification"]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[1].fromNode.id).toBe("Netflix Household");
    expect(graph.edges[1].toNode.id).toBe("Travel");
  });

  it("returns an empty graph when the run has no graph facts", () => {
    expect(buildRelationshipGraph([])).toEqual({ nodes: [], edges: [] });
  });
});

