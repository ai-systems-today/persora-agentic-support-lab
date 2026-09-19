const endpoint = process.env.AGENTIC_DEMO_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const allowed = process.env.ALLOW_PAID_LOAD_TEST === "yes";
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? "3");

if (!allowed) throw new Error("Set ALLOW_PAID_LOAD_TEST=yes only after explicit budget approval");
if (!endpoint || !key) throw new Error("AGENTIC_DEMO_URL and SUPABASE_PUBLISHABLE_KEY are required");
if (!Number.isInteger(requests) || requests < 1 || requests > 10) throw new Error("LOAD_TEST_REQUESTS must be an integer from 1 to 10");

const samples = [];
for (let index = 0; index < requests; index += 1) {
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "apikey": key,
      "Origin": "https://ai-systems-today.github.io",
    },
    body: JSON.stringify({
      message: "Netflix shows NW-23. What should I do?",
      sessionToken: `approved-load-smoke-${crypto.randomUUID()}`,
      deviceId: `approved-load-smoke-${crypto.randomUUID()}`,
    }),
  });
  samples.push({ status: response.status, durationMs: Math.round(performance.now() - started) });
}
console.log(JSON.stringify({ requests, samples }, null, 2));
