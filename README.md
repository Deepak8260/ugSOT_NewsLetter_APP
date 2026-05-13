# ugSOT Newsletter Management

Monorepo with:
- **Admin UI (Vite):** `artifacts/ugsot` — full React app (dev server default **http://localhost:5173**).
- **Dev gateway (Next.js):** `apps/web` — on **http://localhost:3000** embeds the Vite app in an iframe so your “main” URL is always port 3000.
- **API (Express):** `artifacts/api-server` — default **http://127.0.0.1:3001** (`/api` is proxied by Vite).
- **UI sandbox:** `artifacts/mockup-sandbox`
- **Shared DB schema:** `lib/db`

## Quick start (recommended)

1. Install: `pnpm install`
2. Copy `.env.example` to **`.env` at the repo root** and fill in Supabase and auth values.
3. Run SQL in Supabase: `supabase/schema.sql`
4. Start everything:

```bash
pnpm dev
```

5. Open **http://localhost:3000** — you should see the full admin UI (login, dashboard, etc.) inside the gateway page.

Under the hood this runs the API, Vite on **5173**, and Next on **3000** with an iframe pointing at Vite so hot reload keeps working.

## Run without the Next gateway

If you prefer a single dev server for the UI:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/ugsot run dev
```

Then open **http://localhost:5173** (and keep `VITE_API_TARGET` pointing at your API port).

## Notes

- Newsletter PDFs use **Supabase Storage** (`SUPABASE_STORAGE_BUCKET`).
- **Email sending:**
  - Set `RESEND_API_KEY` for real email; otherwise sends are simulated.
  - Configure `FROM_EMAIL` to send from any email address (default: `newsletter@example.com`).
  - **Bulk send to all employees:** POST `/api/newsletters/:id/send` (no body) sends to all employees in the database.
  - **Custom recipient list:** POST `/api/newsletters/:id/send` with body `{ "emails": ["email1@example.com", "email2@example.com"] }` to send to specific addresses.
  - Batch API sends up to 100 emails per request (efficient).
- Do not commit `.env` or real API keys.
