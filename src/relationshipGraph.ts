import type { HybridGraphFact } from "./hybridRagClient";

export type RelationshipNode = { id: string; x: number; y: number };
export type RelationshipEdge = HybridGraphFact & { id: string; fromNode: RelationshipNode; toNode: RelationshipNode };

export function buildRelationshipGraph(facts: HybridGraphFact[], width = 900, height = 420) {
  const names = [...new Set(facts.flatMap((fact) => [fact.from, fact.to]))].sort();
  const radiusX = Math.min(330, width * 0.36);
  const radiusY = Math.min(145, height * 0.34);
  const nodes = names.map((id, index) => {
    const angle = names.length === 1 ? 0 : (index / names.length) * Math.PI * 2 - Math.PI / 2;
    return { id, x: width / 2 + Math.cos(angle) * radiusX, y: height / 2 + Math.sin(angle) * radiusY };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = facts.flatMap((fact, index) => {
    const fromNode = byId.get(fact.from);
    const toNode = byId.get(fact.to);
    return fromNode && toNode ? [{ ...fact, id: `${fact.from}-${fact.relationship}-${fact.to}-${index}`, fromNode, toNode }] : [];
  });
  return { nodes, edges };
}

