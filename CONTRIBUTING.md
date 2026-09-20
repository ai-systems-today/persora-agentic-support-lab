# Contributing

## Local setup

```bash
npm ci
npm run dev
```

Fixture mode requires no provider credentials. Do not copy `.env` files or secrets from another repository.

## Required validation

```bash
npm test
npm run validate:release
npm run build
git diff --check
```

Changes to Supabase Edge Functions must also pass the Deno checks defined in `.github/workflows/pages.yml`.

## Evidence rules

- Preserve the evidence statuses: Runtime-proven, Repo-defined, Fixture replay, Not captured, Not executed and Not evaluated.
- Do not present an integration as executed without evidence from the same run.
- Do not replace a live failure with fixture output.
- Keep live evaluation inputs tied to the exact displayed question, answer and contexts.
- Keep Python RAGAS release evidence separate from live-run evaluation.
- Do not expose private Langfuse content or credentials.

## Pull requests

Keep changes small and reversible. Explain the proven failure or requirement, list affected files, report every executed check, and identify any check that was not run.

## Security

Never commit service-role keys, provider secrets, private URLs, personal data or local `.env` files. Follow [SECURITY.md](SECURITY.md) for vulnerability reporting.
