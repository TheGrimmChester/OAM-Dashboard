# Install

## Local

```bash
npm install
VITE_API_URL=http://127.0.0.1:8090 npm run dev
```

The `@open-family/ui` and `@open-family/client` dependencies are `file:` links to
the sibling `Open-UI-JS` and `Open-Client-JS` checkouts, so those must be present
at `../`. `vite.config.js` dedupes `react` through the symlink — without it the
kit resolves its own copy and the app renders with two Reacts.

## Docker

```bash
docker build -t oam-dashboard:smoke .
```

The build context must include the sibling `Open-*-JS` packages. In the family
stack this is done by `OPA-Stack/harness/rebuild-nas-images.sh`.

## Compose

Part of `OPA-Stack`:

```bash
docker compose -f compose.all.yaml up -d oam oam-dashboard
```

Then open http://127.0.0.1:8097.
