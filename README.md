# OAM-Dashboard

The console for **OAM (Open Account Manager)** — the Open family's account,
directory and configuration plane. Built on `@open-family/ui` and served by nginx
in front of `oam-api`.

## What it is for

Six things live here that used to live nowhere, or in five places:

| Page | Answers |
|---|---|
| **Agents & Models** | Which model runs which task, per organisation and per user — and which layer supplied it |
| **AI Endpoints** | Which APIs and agent accounts exist, and the order a job falls through them |
| **Credentials** | Which AI provider keys and connector secrets exist, at which scope |
| **Organisations / Projects** | The authoritative directory every family product reads |
| **Users** | Accounts that survive a restart, with roles and project ACLs |
| **Audit** | Which credential a job resolved, from which scope, with which model |

### Agents & Models is the point

"Light model to plan, strong model to implement" is configured here, not in a
deployment's environment. The table has one row per agent that a product has
**published** to `/api/agents/catalog`, so adding a job kind to OPM needs no
change in this console. Each row shows:

- the **effective model** — what a job would actually run right now, read from
  `GET /api/models/effective` rather than re-derived client-side, so it cannot
  disagree with the resolution that runs jobs;
- **where it comes from** — task override, your override, organisation, product
  default, or the family default. An inherited value is rendered dimmed and only
  offers *Set*; a value owned at the level you are editing also offers *Reset*.

The **Organisation / Just me** switch decides which layer you are writing. It is
explicit rather than inferred from your role, because an admin can legitimately
set both, and they have very different blast radius.

### AI Endpoints is the failover policy

An endpoint is a provider *account*: an OpenAI-compatible or Anthropic-compatible
API (official or not), a Cursor login, a Claude Code install, or another agent CLI.
A scope may hold many of each — three Cursor accounts, an OpenRouter endpoint
beside the official Anthropic one — and the table **is** the order a job tries
them, top to bottom.

Reordering sends the whole list rather than one endpoint's new number: a client
that PATCHed a single priority would have to renumber the rest itself, and two
people reordering at once would interleave into an order neither chose.

Three states are kept visually distinct because they call for different actions —
`ready`, `disabled` (jobs skip it, credential kept), and `no credential`
(configured but unusable, and silently skipped by every job). The last one looking
like the first is exactly how "why did my job skip endpoint 1" becomes
unanswerable.

## What it deliberately does not do

- **No secret is ever displayed.** The list endpoint returns `has_value`, never a
  value; values leave OAM only through the service-JWT resolve endpoint a job
  calls. There is no reveal control and no state that holds a fetched secret,
  because the honest UI for a write-only store is one that does not pretend
  otherwise.
- **No client-side precedence logic.** The five-layer order is OAM's; this app
  renders the answer and names the layer.

## Running it

```bash
npm install
VITE_API_URL=http://127.0.0.1:8090 npm run dev   # http://localhost:3005
```

```bash
npm test          # vitest
npm run build     # dist/
```

In compose, `VITE_API_URL` is empty and nginx path-proxies `/api/` to
`oam-api:8090`. Ports: **8097** on the laptop stack, **18097** on NAS.

## Configuration

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | OAM API base. Empty = same origin (the nginx proxy). Defaults to `http://127.0.0.1:8090` in dev. |
| `VITE_API_PROXY_TARGET` | Dev-server proxy target for `/api`. |

## Scope headers

Every request carries `X-Organization-ID` / `X-Project-ID` from the top-bar
switcher — on writes as well as reads, because a credential or binding *is* a
scoped object rather than a filtered view. The headers are built at request time
from a value the switcher updates synchronously; see the comment at the top of
[`src/contexts/TenantContext.jsx`](src/contexts/TenantContext.jsx) for why an
effect-registered interceptor was wrong, and `tenantScope.test.js` for the guard
that keeps it that way.

## Layout

```
src/
  App.jsx                   routes + auth gate
  nav.js                    the IA (one glyph per destination, asserted)
  contexts/TenantContext.jsx  org/project scope, sent on every request
  hooks/useApi.js           GET with loading/error/empty kept distinct
  utils/inheritance.js      the inherited-value model, pure and tested
  pages/                    one file per rail destination
```
