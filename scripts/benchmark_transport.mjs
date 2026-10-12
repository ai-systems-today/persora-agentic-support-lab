// Capture actual first displayed answer content, not status events or model TTFT.
export async function readBenchmarkResponse(response, started) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  if (!response.body) throw new Error('Missing response stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', answer = '', evidence = null, citations = [], firstAnswerTextMs = null;
  function line(value) {
    if (!value.startsWith('data:')) return;
    const text = value.slice(5).trim();
    if (!text || text === '[DONE]') return;
    const event = JSON.parse(text);
    if (event.type === 'TEXT_MESSAGE_CONTENT' && typeof event.delta === 'string') {
      if (event.delta.trim() && firstAnswerTextMs === null) firstAnswerTextMs = Math.round(performance.now() - started);
      answer += event.delta;
    }
    if (event.type === 'CUSTOM' && event.name === 'persora.evidence') {
      evidence = event.value?.evidence ?? null;
      citations = event.value?.citations ?? [];
    }
    if (event.type === 'RUN_ERROR') throw new Error('Application stream failed');
  }
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
    for (const value of lines) line(value);
    if (done) break;
  }
  if (buffer) line(buffer);
  if (!evidence) throw new Error('Final evaluation evidence missing from stream');
  evidence.timings = { ...(evidence.timings ?? {}), firstAnswerTextMs };
  return { answer, evidence, citations };
}
