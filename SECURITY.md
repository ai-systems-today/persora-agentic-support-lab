# Security policy

## Supported version

Security fixes target the current `main` branch and the public GitHub Pages deployment.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, exploitable URLs or reproduction data that could expose the shared demonstration infrastructure.

Use the repository’s [private vulnerability reporting](https://github.com/ai-systems-today/persora-agentic-support-lab/security/advisories/new). Include the affected path, impact, minimal reproduction and any suggested mitigation. Remove secrets and personal data from screenshots and logs.

## Public-client boundary

The Supabase anon JWT, project URL and published widget identifiers in the browser are intentionally public. They must never be treated as privileged credentials. Service-role keys, Vault values, Azure OpenAI credentials, Langfuse secrets and the Playwright MCP endpoint are server-only.

If a server credential is discovered in the repository or its history, revoke and rotate it before attempting source-history cleanup.
