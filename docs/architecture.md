# Architecture

A React/Vite SPA served by nginx, which path-proxies `/api/` to `oam-api:8090`.
No state lives in this app that is not either UI state or the org/project scope.

## Data flow

```
browser ──/api/*──▶ nginx ──▶ oam-api:8090 ──▶ ClickHouse (oam.*)
        ──/hub-auth/*──▶ opa-hub:8080     (parity bridge; OAM issues its own tokens)
```

Every request carries `X-Organization-ID` and `X-Project-ID` from the top-bar
switcher, stamped by a single axios interceptor installed once for the life of the
app. The values are read at request time rather than captured, because an
interceptor re-registered by an effect keyed on the organisation runs one commit
behind its provider — React runs a child's effects before its parent's, so a page
refetching on an org change would send the *previous* org. On a console where the
same header decides where a write lands, that is a wrong-organisation write, not
just a stale read.

## The two endpoints Agents & Models needs

`GET /api/agents/catalog` supplies the **rows** — which agents exist, published by
each product on boot. `GET /api/models/effective?product=&agent_key=` supplies the
**value and its provenance** for one agent.

Splitting them this way is deliberate:

- Rendering stored bindings alone would omit exactly the agents someone came to
  configure — an agent with no binding yet.
- Re-deriving the five-layer precedence in the browser would be a second
  implementation of it, free to disagree with the one that resolves real jobs.
  The page asks the service what would run.

## Authentication

`RequireAuth` probes `/api/auth/status`. A 401/403 redirects to `/login`; anything
else lets the app through, so a deployment running with auth off — or a transient
network failure — does not lock an operator out of the console that configures the
credentials.

Login posts to OAM's own `/api/auth/login` (backed by `oam.users`) rather than
proxying the hub, which is the point of the identity move: the issuer is backed by
rows that survive a restart.
