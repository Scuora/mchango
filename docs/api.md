# API notes

The backend serves two listeners:

| Listener | Default | Serves |
| --- | --- | --- |
| Public | `127.0.0.1:8080` | `/` (public page), `/api/public/*`, `/api/health` |
| Management | `127.0.0.1:8081` | everything above, plus `/manage/*` and `/api/manage/*` |

The public listener has no management routes at all, so a proxy that exposes it
cannot expose management by mistake.

## Money

- All amounts are **integers in KES minor units (cents)**: `KES 1,250.50` → `125050`.
  Field names end in `_minor`.
- Single amounts must be `1 ≤ amount ≤ 10_000_000_000` (KES 100,000,000.00).
  The backend rejects zero, negative, fractional and larger values when it
  reads the request.
- Totals are signed 64-bit integers.
- Decimal input is parsed without floating point, in Rust (`backend/src/money.rs`)
  and TypeScript (`frontend/src/lib/money.ts`). Both are tested against
  `docs/money-test-vectors.json`. Rules: optional `KES`/`Ksh` prefix, thousands
  separators only in groups of three, at most two decimals, nothing rounded.

## Time

- Instants are UTC RFC 3339 strings, e.g. `2024-06-02T07:15:00Z`.
- Inputs may carry any offset; the UI sends Nairobi time as `…+03:00`.
- Calendar dates (`period_start`, `start_date`, filters) are `YYYY-MM-DD` in
  Africa/Nairobi, which has been UTC+3 without daylight saving since 1960.
- *Transaction time* (`occurred_at`) and *recorded* time (`recorded_at`,
  `created_at`) are always separate fields.

## Errors

```json
{ "error": { "code": "invalid", "message": "Choose the account.", "field": "account_id" } }
```

Codes: `invalid` (422), `not_found` (404), `conflict` (409), `unauthenticated` /
`invalid_credentials` (401), `too_many_attempts` (429), `forbidden` (403),
`too_large` (413), `unsupported` (415), `internal` (500, nothing was saved).

## Management requests

- You must be signed in: `POST /api/manage/auth/login {username, password}`
  sets an HttpOnly, SameSite=Strict cookie that lasts 30 days. The session is
  extended while you keep using it.
- Every change (POST/PUT) must send the header `x-mchango: 1` from the app's own
  origin. Requests from other sites are refused.
- The `Host` must be `localhost`, `127.0.0.1`, the listen address, or one of
  `MANAGE_ALLOWED_HOSTS`. This protects against DNS rebinding.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/manage/auth/login`, `/auth/logout`; GET `/auth/me` | Sign in and out |
| GET | `/api/manage/overview` | Totals, where the money is, items needing attention |
| GET/PUT | `/api/manage/settings` | Fundraiser settings, memorial name and dates, opening funds |
| PUT/DELETE | `/api/manage/settings/photo` | Memorial photo (multipart `file`: JPEG, PNG or WebP) |
| PUT | `/api/manage/settings/public-details` | How to give (M-Pesa), funeral details, organisers, whether per-person amounts are shown |
| GET/POST, PUT/DELETE | `/api/manage/announcements`, `/announcements/{id}` | Announcements for the public Updates page |
| GET | `/api/manage/reports/statement?from&to` | Figures for a statement of account (the PDF is laid out in the browser) |
| GET | `/api/manage/public-preview` | The public view (allowlisted), for previews and WhatsApp updates |
| GET/POST, PUT | `/api/manage/accounts`, `/accounts/{id}` | Money accounts |
| POST | `/api/manage/capture/parse` | Read an M-Pesa message (proposes values, saves nothing) |
| GET/POST | `/api/manage/transactions` | List (filters: `q, kind, from, to, status, account_id, limit, offset`) and create |
| GET | `/api/manage/transactions/{id}` | Detail: versions, documents, statement links, history |
| PUT | `/api/manage/transactions/{id}/presentation` | Public name, description, notes |
| POST | `/api/manage/transactions/{id}/corrections` | `{reason, replacement}`; `replacement: null` removes |
| POST | `/api/manage/transactions/{id}/receipts` | Multipart `file` (PDF, JPEG, PNG, WebP) |
| GET | `/api/manage/documents/{id}/file` | Private file |
| POST | `/api/manage/documents/{id}/publish` | `{publish, confirm_redacted}` |
| GET/POST | `/api/manage/statements` | List and upload (multipart `account_id`, `password?`, `file`) |
| GET | `/api/manage/statements/{id}` | Rows, matches, balance check, readiness |
| POST | `/api/manage/statements/{id}/retry`, `/discard`, `/rematch`, `/complete` | Import actions |
| POST | `/api/manage/statements/{id}/rows/{row}/link`, `/unlink`, `/create` | Row decisions |
| GET | `/api/manage/export/transactions.csv`, `/export/full.json` | Data export |

## Public requests

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/public/page` | The public page (404 until published in settings) |
| GET | `/api/public/receipts/{token}` | A receipt explicitly published with a random token |
| GET | `/api/public/memorial-photo` | The memorial photo: public once the page is published, otherwise only for signed-in managers |
| POST | `/api/public/check` | `{code}`: confirms a recorded contribution by its M-Pesa code (contributions only; rate-limited per visitor and overall) |

The page HTML itself is rendered by the server with the title and Open Graph
tags (name, dates, portrait), so WhatsApp link previews show the memorial.
| GET | `/api/health` | Health check |

Public responses are built from an explicit field allowlist
(`backend/src/publication.rs`). Private records never reach the browser to be
hidden there. The public totals are computed from the same records that are
listed.
