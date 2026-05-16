# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

Learnistry is a serverless AI quiz platform built on Netlify. It consists of:
- A static frontend (`index.html`) — vanilla HTML/CSS/JS, no build step
- 8 Netlify serverless functions (`netlify/functions/`) — ES modules using `openai` and `@upstash/redis`

### Running the Dev Server

```bash
netlify dev --offline
```

This starts the local dev server at `http://localhost:8888`, serving both the static frontend and the serverless functions. The `--offline` flag skips Netlify account linking (no Netlify login needed).

### Required Environment Variables

Create a `.env` file in the project root (not committed) with:
- `OPENAI_API_KEY` — for the `generate` function (quiz generation via GPT-4.1-mini)
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST endpoint (all functions use this for data storage)
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis auth token

Without real credentials, the functions will load and execute validation logic but fail at external API calls.

### Testing Functions Locally

Functions can be tested via curl:
```bash
curl -X POST http://localhost:8888/.netlify/functions/initUser \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123","email":"test@example.com"}'
```

### Important Notes

- No test framework is configured — there are no automated test scripts in `package.json`.
- No build step — the frontend is plain HTML served as-is.
- No linter is configured in the project.
- The project uses `"type": "module"` (ES modules throughout).
- `netlify-cli` must be installed globally (`npm install -g netlify-cli`) — it is not a project dependency.
- Netlify Identity (auth) requires an active internet connection and a linked Netlify site for full functionality; in offline dev mode, auth flows will not work but all other UI and function endpoints are accessible.
