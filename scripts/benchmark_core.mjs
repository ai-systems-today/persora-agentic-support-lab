import { metric, labelledRetrieval } from '../supabase/functions/_shared/evaluationReport.ts';

export function evaluateCase(test, payload, elapsedMs) {
  const e = payload.evidence ?? {};
  const q = e.quality ?? {};
  const judge = e.integrations?.ragas;
  let snapshot = e.evaluationSnapshot ?? null;
  const privateCaptures = e.privateEvaluationEvidence ?? [];
  if (snapshot && privateCaptures.length) {
    snapshot = { ...snapshot, contexts: privateCaptures.filter(c => c.stage !== 'draft').flatMap(c => c.passages.map(p => ({ id: p.id, rank: p.rank, label: p.label, url: null, text: p.text }))), contextOrigin: 'generator-passages' };
  }
  const metrics = [];
  const failures = [];
  const evaluated = (name, value, method, reason, unit = 'ratio') => metrics.push(metric(name, value ?? null, unit, method, reason));
  evaluated('total_answer_ms', elapsedMs, 'client-monotonic-clock-v1', 'Request start through complete response', 'ms');
  evaluated('retrieval_ms', e.retrieval?.durationMs, 'retrieval-span-v1', 'Missing retrieval-only span is not estimated from generation time', 'ms');
  evaluated('first_answer_text_ms', e.timings?.firstAnswerTextMs, 'first-answer-content-v1', 'JSON transport cannot measure first streamed answer text', 'ms');
  evaluated('evaluation_ms', e.timings?.evaluationMs ?? judge?.durationMs, 'server-evaluator-span-v1', 'Includes blocking checks when captured', 'ms');
  evaluated('repair_input_tokens', snapshot?.repair?.inputTokens, 'provider-repair-usage', 'Repair generation only; not total request usage', 'count');
  evaluated('repair_output_tokens', snapshot?.repair?.outputTokens, 'provider-repair-usage', 'Repair generation only; not total request usage', 'count');
  for (const [name, key] of [['lexical_grounding', 'grounding'], ['citation_validity', 'citationValidity'], ['citation_coverage', 'citationCoverage'], ['lexical_question_overlap', 'answerRelevance'], ['lexical_intent_coverage', 'intentCoverage']]) {
    evaluated(name, q.executed ? q[key] : null, q.method ?? 'deterministic-v1', q.reason ?? 'Deterministic check not executed');
  }
  for (const [name, key] of [['custom_faithfulness', 'faithfulness'], ['custom_answer_relevancy', 'responseRelevancy'], ['custom_context_relevance_fraction', 'contextPrecision'], ['custom_context_recall', 'contextRecall'], ['custom_factual_correctness', 'factualCorrectness']]) {
    evaluated(name, judge?.executed ? judge.metrics?.[key] : null, judge?.evaluatorVersion ?? 'custom-judge', judge?.reasons?.[key] ?? judge?.error ?? 'No applicable custom judgement');
  }
  evaluated('unsupported_claims', judge?.executed ? judge.unsupportedClaims.length : null, 'custom-judge', 'Count is diagnostic; empty list does not override a failing faithfulness score', 'count');
  const ids = snapshot?.contexts.map(c => c.id).filter(id => typeof id === 'string') ?? [];
  metrics.push(...labelledRetrieval(ids, privateCaptures.length > 1 || snapshot?.contexts.some(c => c.id === null) ? undefined : test.retrievalLabels, 10));
  evaluated('request_success', payload.error ? 0 : 1, 'http-application-v1', 'Successful transport does not prove relevant retrieval');
  const request = snapshot?.retrievalRequest;
  evaluated('required_filter_compliance', request && test.requiredFilters ? Number(Object.entries(test.requiredFilters).every(([k, v]) => request.filters[k] === v)) : null, 'case-filter-contract-v1', 'Actual upstream request and reviewed required filters must both be captured');
  evaluated('query_intent_preservation', null, 'review-required', 'Actual query and semantic intent assessment not captured');
  const scopes = privateCaptures.flatMap(c => c.searches.map(s => s.scopeValid));
  evaluated('authorization_scope_compliance', scopes.length && scopes.every(v => typeof v === 'boolean') ? Number(scopes.every(Boolean)) : null, 'returned-row-scope-membership-v1', 'Checks returned row membership against the actual scoped request; does not replace an authorization security audit');
  evaluated('returned_count', e.retrieval?.returnedCount, 'returned-citations-v1', 'Returned citations may be a subset of retrieval results', 'count');
  const documentIds = privateCaptures.flatMap(c => c.passages.map(p => p.documentId));
  evaluated('unique_document_count', documentIds.length && documentIds.every(id => typeof id === 'string') ? new Set(documentIds).size : null, 'captured-document-ids-v1', 'Requires actual document IDs; chunk IDs are not counted as distinct documents', 'count');
  let behaviour = true;
  for (const [actual, expected, label] of [[e.guardrail?.decision, test.expected.guardrail, 'guardrail'], [e.handoff?.status, test.expected.handoff, 'handoff']]) {
    if (expected !== undefined && actual !== expected) { behaviour = false; failures.push(`${label}: expected ${expected}, received ${actual ?? 'not captured'}`); }
  }
  for (const event of test.expected.prohibitedEvents ?? []) if ((e.eventTypes ?? []).includes(event)) { behaviour = false; failures.push(`Prohibited event: ${event}`); }
  for (const event of test.expected.requiredEvents ?? []) if (!(e.eventTypes ?? []).includes(event)) { behaviour = false; failures.push(`Required event missing: ${event}`); }
  evaluated('policy_compliance', behaviour ? 1 : 0, 'case-behaviour-contract-v1', 'Only the explicitly asserted behaviour is covered');
  evaluated('tool_correctness', null, 'tool-trajectory-v1', 'Complete tool arguments/results are not captured by the public evidence contract');
  evaluated('task_success', test.expected.handoff || test.expected.guardrail === 'block' ? Number(behaviour) : null, 'case-observable-outcome-v1', 'Knowledge task success requires reviewed required facts');
  evaluated('answer_transformation_count', snapshot ? Number(snapshot.decision.action !== 'deliver' && snapshot.decision.action !== 'policy-response') : null, 'decision-v1', 'Count of fallback/qualification transformations; not a model repair count', 'count');
  const observations = e.integrations?.langfuse?.observations ?? [];
  for (const [name, key, unit] of [['input_tokens', 'inputTokens', 'count'], ['output_tokens', 'outputTokens', 'count'], ['total_cost', 'totalCost', 'USD']]) {
    const values = observations.map(o => o[key]).filter(v => typeof v === 'number');
    evaluated(name, values.length ? values.reduce((a, b) => a + b, 0) : null, 'provider-observation-usage', 'Only captured usage; absent values are not zero', unit);
  }
  for (const name of ['ragas_faithfulness', 'ragas_context_precision', 'ragas_context_recall', 'ragas_factual_correctness', 'ragas_answer_relevancy', 'required_fact_coverage', 'contradicted_claims', 'citation_semantic_support']) {
    evaluated(name, null, 'offline-reviewed-reference', 'Run the offline evaluator; reference-dependent metrics require approved expectations');
  }
  if (judge?.status === 'failed') failures.push('Custom semantic evaluation failed');
  if (snapshot?.decision.action === 'fallback' || snapshot?.decision.action === 'qualify') failures.push(`Answer decision: ${snapshot.decision.action}`);
  if (metrics.some(m => m.status === 'error')) failures.push('Invalid metric value');
  if (payload.error) failures.push(String(payload.error));
  const knowledge = test.category === 'knowledge';
  if (knowledge && !judge?.executed) failures.push('Required live semantic evaluation unavailable');
  const pending = test.review.status !== 'approved' || (knowledge && !snapshot);
  return { caseId: test.id, question: test.question, category: test.category, runId: e.traceId ?? '',
    status: failures.length ? 'failed' : pending ? 'not-evaluated' : 'passed', answer: payload.answer ?? '',
    metrics, failures, evidence: snapshot, sources: (payload.citations ?? []).map(c => ({ label: c.title ?? c.label ?? c.source ?? 'Source', url: c.url ?? c.source_url ?? null, text: c.snippet ?? c.content ?? '' })),
    expectedFacts: test.requiredFacts, reviewStatus: test.review.status, reviewKind: test.review.kind ?? 'unknown', reviewer: test.review.reviewer ?? null, blocked: e.guardrail?.decision === 'block', langfuseExported: Boolean(e.integrations?.langfuse?.executed) };
}

export function applyGates(report, config) {
  const issues = [];
  if (!report.cases.length) issues.push('No cases executed');
  if (config.requireCalibratedThresholds && config.pendingCalibration?.length) issues.push('Release quality thresholds remain pending calibration');
  if (report.cases.some(c => c.status === 'failed')) issues.push('One or more cases failed');
  if (report.comparisonWarnings?.includes('Partial suite: not all selected dataset cases executed')) issues.push('Incomplete test suite');
  for (const c of report.cases.filter(c => c.category === 'knowledge')) {
    if (config.requireCapturedBackendVersion && !c.evidence?.versions.backend) issues.push(`${c.caseId}: backend revision not captured`);
    if (config.requireCapturedCorpusVersion && !c.evidence?.versions.corpus) issues.push(`${c.caseId}: retrieval corpus version not captured`);
    if (config.requireRetrievalRequest && !c.evidence?.retrievalRequest) issues.push(`${c.caseId}: actual retrieval request not captured`);
  }
  if (config.requireReviewedReferences && report.cases.some(c => c.reviewStatus !== 'approved')) issues.push('References/behaviour expectations still require review');
  for (const c of report.cases) for (const [name, rule] of Object.entries(config.metrics ?? {})) {
    const m = c.metrics.find(m => m.name === name);
    if (rule.categories && !rule.categories.includes(c.category)) continue;
    if (rule.required && m?.status !== 'evaluated') issues.push(`${c.caseId}: required ${name} unavailable`);
    if (m?.value != null && ((rule.min != null && m.value < rule.min) || (rule.max != null && m.value > rule.max))) issues.push(`${c.caseId}: ${name} violates configured gate`);
  }
  return issues;
}
