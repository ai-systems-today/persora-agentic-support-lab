import { useMemo, useState } from "react";
import type { HybridGraphFact } from "./hybridRagClient";
import { buildRelationshipGraph } from "./relationshipGraph";

type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

export default function RelationshipGraph({ facts }: { facts: HybridGraphFact[] }) {
  const graph = useMemo(() => buildRelationshipGraph(facts), [facts]);
  const [selection, setSelection] = useState<Selection>(null);
  const selectedEdge = selection?.type === "edge" ? graph.edges.find((edge) => edge.id === selection.id) ?? null : null;
  const selectedNode = selection?.type === "node" ? graph.nodes.find((node) => node.id === selection.id) ?? null : null;
  const connectedEdges = selectedNode ? graph.edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id) : [];
  const activeEdgeIds = new Set(selectedNode ? connectedEdges.map((edge) => edge.id) : selectedEdge ? [selectedEdge.id] : []);
  const activeNodeIds = new Set(selectedEdge ? [selectedEdge.from, selectedEdge.to] : selectedNode ? [selectedNode.id] : []);
  const activate = (next: Selection) => setSelection((current) => current?.type === next?.type && current?.id === next?.id ? null : next);

  if (!facts.length) return null;

  return (
    <section className="relationship-graph" aria-labelledby="relationship-graph-title">
      <header>
        <div><p className="eyebrow">Neo4j exact-run evidence</p><h2 id="relationship-graph-title">Knowledge relationship graph</h2></div>
        <span>{graph.nodes.length} topics · {graph.edges.length} relationships</span>
      </header>
      <div className="relationship-canvas">
        <svg viewBox="0 0 900 420" role="img" aria-label={`Neo4j graph with ${graph.nodes.length} topics and ${graph.edges.length} relationships`}>
          <defs>
            <marker id="relationship-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          </defs>
          {graph.edges.map((edge) => {
            const active = activeEdgeIds.has(edge.id);
            const midX = (edge.fromNode.x + edge.toNode.x) / 2;
            const midY = (edge.fromNode.y + edge.toNode.y) / 2;
            return <g key={edge.id} className={active ? "active" : ""} role="button" tabIndex={0} aria-label={`${edge.from} ${edge.relationship.replaceAll("_", " ")} ${edge.to}`} onClick={() => activate({ type: "edge", id: edge.id })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") activate({ type: "edge", id: edge.id }); }}>
              <line className="edge-hit" x1={edge.fromNode.x} y1={edge.fromNode.y} x2={edge.toNode.x} y2={edge.toNode.y} />
              <line className="edge-line" x1={edge.fromNode.x} y1={edge.fromNode.y} x2={edge.toNode.x} y2={edge.toNode.y} markerEnd="url(#relationship-arrow)" />
              <text className="edge-label" x={midX} y={midY - 8} textAnchor="middle">{edge.relationship.replaceAll("_", " ")}</text>
            </g>;
          })}
          {graph.nodes.map((node) => {
            const active = activeNodeIds.has(node.id);
            return <g key={node.id} className={`relationship-node${active ? " active" : ""}`} role="button" tabIndex={0} aria-label={`${node.id} topic`} onClick={() => activate({ type: "node", id: node.id })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") activate({ type: "node", id: node.id }); }}>
              <circle cx={node.x} cy={node.y} r="43" />
              <text x={node.x} y={node.y - 4} textAnchor="middle">{node.id.length > 18 ? `${node.id.slice(0, 17)}…` : node.id}</text>
              <text className="node-kind" x={node.x} y={node.y + 13} textAnchor="middle">TOPIC</text>
            </g>;
          })}
        </svg>
      </div>
      <div className="relationship-inspector" aria-live="polite">
        {selectedEdge ? <>
          <div><span>Selected relationship</span><strong>{selectedEdge.from} → {selectedEdge.relationship.replaceAll("_", " ")} → {selectedEdge.to}</strong></div>
          <div><span>Evidence</span><strong>{selectedEdge.sourceChunkIds.length} source chunks · {selectedEdge.sourceUrls.length} source URLs</strong></div>
          <div className="relationship-links"><span>Original sources</span>{selectedEdge.sourceUrls.length ? selectedEdge.sourceUrls.slice(0, 4).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1} ↗</a>) : <strong>No source URL returned</strong>}</div>
        </> : selectedNode ? <>
          <div><span>Selected topic</span><strong>{selectedNode.id}</strong></div>
          <div><span>Connected relationships</span><strong>{connectedEdges.length} returned in this run</strong></div>
          <div><span>Evidence rule</span><strong>Exact-run Neo4j results only</strong></div>
        </> : <p>Select a topic or relationship to inspect its exact-run evidence.</p>}
      </div>
    </section>
  );
}

