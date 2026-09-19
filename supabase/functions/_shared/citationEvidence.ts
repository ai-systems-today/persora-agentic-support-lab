const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

export function orderCitations(values: unknown[]): unknown[] {
  return values
    .map((value, position) => {
      const index = record(value).index;
      return { value, position, index: typeof index === "number" && Number.isFinite(index) ? index : position + 1 };
    })
    .sort((left, right) => left.index - right.index || left.position - right.position)
    .map(({ value }) => value);
}

export function normalizeCitationBundle(answer: string, values: unknown[]): { answer: string; citations: unknown[] } {
  const ordered = values
    .map((value, position) => {
      const index = record(value).index;
      return { value, position, originalIndex: typeof index === "number" && Number.isFinite(index) ? index : position + 1 };
    })
    .sort((left, right) => left.originalIndex - right.originalIndex || left.position - right.position);
  const remap = new Map<number, number>();
  const citations = ordered.map(({ value, originalIndex }, position) => {
    remap.set(originalIndex, position + 1);
    const citation = record(value);
    return Object.keys(citation).length ? { ...citation, index: position + 1 } : value;
  });
  return {
    answer: answer.replace(/\[#(\d+)\]/g, (match, value: string) => {
      const mapped = remap.get(Number(value));
      return mapped ? `[#${mapped}]` : match;
    }),
    citations,
  };
}

export function citationEvidenceText(value: unknown): string | null {
  const citation = record(value);
  const locator = record(citation.locator);
  const parts = [
    citation.snippet,
    citation.content,
    citation.text,
    locator.heading,
    locator.exact_quote,
    locator.exact_quote_end,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  const unique = [...new Set(parts.map((part) => part.trim()))];
  return unique.length ? unique.join("\n") : null;
}

export function selectReferencedContexts(answer: string, contexts: string[]): string[] {
  const references = [...new Set(Array.from(answer.matchAll(/\[#(\d+)\]/g), (match) => Number(match[1])))]
    .filter((reference) => Number.isInteger(reference) && reference >= 1 && reference <= contexts.length);
  return references.length ? references.map((reference) => contexts[reference - 1]) : contexts;
}
