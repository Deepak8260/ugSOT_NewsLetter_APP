# ugSOT Newsletter Management System

An internal admin web application for upGrad School Of Technology (ugSOT) to manage and distribute company newsletters to all employees via email.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ugsot run dev` — run the frontend (port 23162)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + shadcn/ui + Tailwind CSS + wouter + TanStack Query
- API: Express 5 + session-based auth
- DB: PostgreSQL + Drizzle ORM
- File storage: Replit Object Storage (Google Cloud Storage) for newsletter PDFs
- Email: Resend API
- Excel parsing: SheetJS (xlsx)
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle DB schema (employees, newsletters, emailLogs)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/ugsot/src/` — React frontend

## Architecture decisions

- Session-based admin auth (no OAuth, no multi-user). Credentials stored in `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars.
- Newsletter PDFs uploaded server-side via multer, then stored to GCS object storage bucket.
- Email sending uses Resend API with HTML template + PDF attachment. Falls back to simulated send if `RESEND_API_KEY` not set.
- Multipart file upload endpoints (`/api/employees/upload`, `/api/newsletters/upload`) are handled outside OpenAPI codegen — frontend calls them with raw `fetch` + `FormData`.
- Bulk email sends batched in groups of 10 to avoid rate limits.

## Product

- Admin login → protected dashboard
- Dashboard: stats overview (employees, newsletters, emails sent, delivery rate) + recent newsletters
- Employees: upload Excel/CSV, search, paginate, delete
- Newsletters: upload PDF + metadata, send to all employees, view delivery stats, download PDF, delete
- Email Logs: filterable table by newsletter and delivery status
- Settings: session info + logout

## Required secrets

- `SESSION_SECRET` — Express session secret (already set)
- `ADMIN_EMAIL` — Admin login email
- `ADMIN_PASSWORD` — Admin login password (plaintext)
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — GCS bucket for PDFs (auto-provisioned)
- `RESEND_API_KEY` — Resend API key for sending emails
- `FROM_EMAIL` — (optional) sender email address, defaults to `newsletter@ugsot.com`

## User preferences

- Simple, clean, professional corporate UI — no emojis, no flashy animations
- Dark navy primary color palette

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after changing schema files
- `RESEND_API_KEY` must be set for real email sending; without it the system logs emails as "sent" without actually sending
- The `FROM_EMAIL` must be a verified domain in your Resend account

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
