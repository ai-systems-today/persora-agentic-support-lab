# Public safety

## Intended public data

- Client application source and deterministic fixtures.
- Supabase project URL and browser-safe anon JWT.
- Published widget and agent identifiers used by the demonstration.
- Sanitized run evidence returned to the public UI.
- Official Netflix Help links and demonstration brand assets.

These identifiers are not authorization substitutes. The Edge Functions must continue to validate JWTs, origins, request shapes and downstream permissions.

## Data that must remain private

- Supabase service-role credentials.
- Azure OpenAI keys and private deployment credentials.
- Langfuse secret keys, private project URLs and raw trace content.
- Playwright MCP internal URL and credentials.
- Vault contents, signing secrets and unredacted personal/account data.
- Local `.env` files and copied credentials from other repositories.

## Existing controls

- `.env` variants are ignored except `.env.example`.
- GitHub Pages receives only the Vite `dist` artifact.
- Server integrations read credentials from environment variables or service-role-only Vault access.
- The source-browser function restricts targets to `help.netflix.com`.
- Public Langfuse read-back is an allow-listed projection.
- Blocked prompts are excluded from telemetry export.
- CI validates the application, Edge Functions and release evidence before deployment.

## Public limitations

- The checked-in anon JWT is intentionally public and must be treated as untrusted client identity.
- In-memory Edge Function rate limiting is best effort, not globally distributed abuse protection.
- Public deployment can consume downstream quotas; retain platform quotas, origin validation and gateway protections.
- Published identifiers reveal integration structure even though they do not grant server privileges.
- No `LICENSE` file is currently present; public visibility does not grant reuse rights.
- The Netflix name and logo are third-party marks used for an independent technical demonstration.

## Release checklist

1. Run `npm audit`, `npm test`, `npm run validate:release` and `npm run build`.
2. Type-check all Supabase Edge Functions as CI does.
3. Review the full diff for credentials, private URLs and personal data.
4. Confirm no secret was added to a `VITE_*` value or client source.
5. Confirm public traces contain only allow-listed fields.
6. Confirm origin, JWT and target-host restrictions still execute.
7. Rotate any credential immediately if it ever appears in Git history.
