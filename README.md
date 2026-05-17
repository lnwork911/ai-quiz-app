# Teacher Quiz SaaS — Phase 1 foundation

Production-minded starter for a **teacher-focused quiz SaaS** on **Netlify** with **vanilla JavaScript**, **Netlify Identity**, **Netlify Functions**, **OpenAI**, **Upstash Redis**, and **Stripe**.

## What ships in Phase 1

- **Static marketing site** (`index.html`, `pricing.html`) plus **auth** (`login.html`) and **teacher dashboard** (`dashboard.html`).
- **Netlify Identity** in the browser with a reusable **JWT** for server calls.
- **Netlify Functions**:
  - `verifyUser` — validates Identity JWTs using `JWT_SECRET`.
  - `generateQuiz` — validates input, optionally caches in Redis, calls OpenAI, returns structured JSON; also handles **Stripe Checkout session creation** via an `action` flag so pricing stays secure without extra client secrets.
- **Frontend modules** (`js/ui.js`, `js/auth.js`, `js/api.js`, `js/app.js`) for **toasts**, **loading states**, **authenticated fetch**, and **page wiring**.
- **Shared server modules** under `netlify/functions/shared/` for **auth**, **OpenAI**, **Redis**, and **validation**.

## Repository layout

```text
.
├── css/styles.css
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── api.js
│   └── ui.js
├── netlify/
│   └── functions/
│       ├── verifyUser.js
│       ├── generateQuiz.js
│       └── shared/
│           ├── auth.js
│           ├── openai.js
│           ├── redis.js
│           └── validation.js
├── index.html
├── dashboard.html
├── login.html
├── pricing.html
├── netlify.toml
├── package.json
└── README.md
```

## Prerequisites

- **Node.js 18+** (matches modern Netlify runtimes).
- A **Netlify** account and site.
- **Netlify Identity** enabled for the site.
- **OpenAI** API key.
- *(Optional but recommended)* **Upstash Redis** REST credentials for quiz caching.
- *(Optional until you enable billing)* **Stripe** secret key + recurring **Price** IDs.

## Environment variables

Configure these in **Netlify → Site configuration → Environment variables** (and in a local `.env` for `netlify dev`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | Yes (for secured Functions) | Copy from **Netlify Identity → JWT secret** so functions can verify browser tokens. |
| `OPENAI_API_KEY` | Yes (for quiz generation) | Server-side calls to OpenAI. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini`. |
| `UPSTASH_REDIS_REST_URL` | No | Enables Redis caching when paired with token. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Enables Redis caching. |
| `QUIZ_CACHE_TTL_SECONDS` | No | Defaults to `86400` (24 hours). |
| `STRIPE_SECRET_KEY` | For checkout | Creates Checkout Sessions on the server. |
| `STRIPE_PRICE_ID_STARTER` | For checkout | Stripe recurring Price for Starter. |
| `STRIPE_PRICE_ID_PRO` | For checkout | Stripe recurring Price for Pro. |
| `STRIPE_PRICE_ID_SCHOOL` | For checkout | Stripe recurring Price for School. |

See `.env.example` for a copy/paste template.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

   Fill in **real** values locally. Never commit `.env`.

3. Install the Netlify CLI (once):

   ```bash
   npm install -g netlify-cli
   ```

4. Start the dev server (static site + functions + injected env):

   ```bash
   netlify dev
   ```

   Open the printed local URL (often `http://localhost:8888`).

5. **Identity note:** External Identity providers (Google, etc.) must be configured in the Netlify UI. Email/password works out of the box for most sites once Identity is enabled.

## Deploying to Netlify

1. Push this repository to GitHub (or GitLab / Bitbucket).
2. In Netlify: **Add new site → Import an existing project** and pick the repo.
3. Build settings:
   - **Build command:** `npm run build` (no-op for static files; safe for future bundlers).
   - **Publish directory:** `.` (repository root), matching `netlify.toml`.
4. Add **all environment variables** from the table above.
5. Under **Identity**, click **Enable Identity**.
6. Under **Identity → Settings → Services**, copy the **JWT secret** into `JWT_SECRET` in Netlify env vars.
7. Deploy the site.

After deploy, visit `/login.html`, create a user, then open `/dashboard.html` to generate a quiz.

## Stripe setup (subscriptions)

1. In Stripe Dashboard, create **Products** and **Prices** (recurring monthly is typical).
2. Copy each Price ID (`price_...`) into `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, and `STRIPE_PRICE_ID_SCHOOL`.
3. Add `STRIPE_SECRET_KEY` (use test keys in staging).
4. Use **Customer portal** and **Tax** settings in Stripe as your business requirements grow.

Checkout success and cancel URLs are generated from Netlify’s `URL` / `DEPLOY_PRIME_URL` environment values.

## Extensibility (Phase 2+)

- **Classes / rosters:** add `classId` metadata on quizzes, store memberships in Redis or a database.
- **Leaderboards:** use sorted sets in Upstash (`ZADD`, `ZRANGE`) keyed by class.
- **Subscriptions:** combine Stripe **webhooks** (new Function) with Redis or a database for entitlements.
- **Analytics:** append-only events to Redis streams or export to your warehouse.
- **Adaptive quizzes:** track per-learner mastery in Redis; feed summarized stats into the OpenAI prompt builder.
- **Quiz caching:** already supported via deterministic Redis keys — tune `QUIZ_CACHE_TTL_SECONDS` per environment.

## Security reminders

- Never expose `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `JWT_SECRET`, or Upstash tokens to the browser.
- Prefer **Content Security Policy** tightening (`netlify.toml`) once you know every third-party script you need.
- Rotate keys if a developer laptop is lost.

## License

Use and modify freely for your classroom product. Add your own license file when you publish publicly.
