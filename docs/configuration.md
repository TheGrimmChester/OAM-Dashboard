# Configuration

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://127.0.0.1:8090` in dev, empty in production | OAM API base. Empty means same origin, which is what the nginx proxy provides in compose. |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8090` | Dev-server proxy target for `/api`. |

## Ports

| Deployment | Port |
|---|---|
| `npm run dev` | 3005 |
| `compose.all.yaml` | 8097 |
| `compose.nas.yaml` | 18097 |

## Local storage keys

| Key | Purpose |
|---|---|
| `auth_token`, `username`, `role` | Session, shared shape with the other five consoles |
| `oam_organization_id`, `oam_project_id` | The scope every request is made in. Seeded from the signing-in user's own organisation. |
| `oam_theme` | light / dark / system |
| `oam_rail_collapsed` | Sidebar state |

There is exactly one theme key. Two of the audited consoles wrote two and
broadcast two events, so two theme controls could disagree.
