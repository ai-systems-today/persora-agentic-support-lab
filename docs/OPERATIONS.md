# Operations and validation

## Local application

```bash
npm ci
npm run dev
```

The Vite development server uses the repository base configuration. Fixture mode works without private credentials.

## Local manual

```bash
python -m pip install --requirement requirements-docs.txt
mkdocs serve
```

MkDocs serves the manual with navigation, search and live reload.

## Required validation

```bash
npm test
npm run validate:release
npm run build
mkdocs build --strict --site-dir dist/docs
```

`--strict` converts documentation warnings into build failures. The documentation build is placed inside the Vite output so one Pages artifact contains both the application and manual.

## CI/CD sequence

1. check out the repository;
2. install locked Node dependencies;
3. set up Python;
4. install pinned evaluator and documentation dependencies;
5. regenerate the deterministic RAGAS benchmark;
6. run tests and release-contract validation;
7. type-check the Edge Functions;
8. build the Vite application;
9. build the manual into `dist/docs`;
10. upload and deploy the Pages artifact.

## Runtime configuration

Browser-safe identifiers can appear in client code. Service-role, Azure, Langfuse and Playwright MCP credentials must remain in server-side configuration or Vault.

Never put a secret in a `VITE_*` variable: Vite makes these values available to the browser bundle.

## Paid test guard

The load-smoke script requires `ALLOW_PAID_LOAD_TEST=yes` and caps execution at ten requests. CI does not run it automatically.

## Troubleshooting checklist

| Symptom | Check first |
|---|---|
| Live answer fails | Published-agent endpoint, allowed origin and visible HTTP error |
| Agentic run fails | JWT, origin, Edge Function revision and event-stream error |
| Sources do not open | `PLAYWRIGHT_MCP_URL`, target host and function response |
| Langfuse stays pending | server configuration, ingestion timing and read-back state |
| A metric is null | whether it needs a trusted reference or the evaluator failed |
| Documentation build fails | broken links, missing nav files and MkDocs warnings |

## Release safety

Review diffs for credentials, private URLs, personal data and overclaimed capabilities. If repository behavior and deployment differ, report both and inspect the deployed revision before diagnosing the cause.
