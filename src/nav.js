/**
 * The OAM information architecture.
 *
 * OAM is a configuration console, so the sections follow *what is being
 * configured* rather than a telemetry hierarchy: the directory (who and what
 * exists), then the secrets and model bindings that jobs resolve against, then
 * the trail of what was resolved.
 *
 * One glyph means one destination. The collapsed rail is icon-only, so a shared
 * glyph makes two rows indistinguishable; `nav.test.js` keeps that true.
 */

export const OVERVIEW_ITEM = {
  to: '/overview',
  label: 'Overview',
  icon: 'grid',
  exact: true,
}

export const NAV_SECTIONS = [
  {
    id: 'directory',
    label: 'Directory',
    items: [
      { to: '/organizations', label: 'Organisations', icon: 'building' },
      { to: '/projects', label: 'Projects', icon: 'folder' },
      { to: '/users', label: 'Users', icon: 'users' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    items: [
      // First in the section because it is the reason the product exists: it is
      // where "light model to plan, strong model to implement" is set.
      { to: '/agents', label: 'Agents & Models', icon: 'cpu' },
      // Directly after it: the endpoints those models resolve against, in the
      // order a job falls through them.
      { to: '/endpoints', label: 'AI Endpoints', icon: 'server' },
      { to: '/credentials', label: 'Credentials', icon: 'key' },
      // SCM installations used by review and project tools across the family.
      { to: '/connectors', label: 'Connectors', icon: 'git' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { to: '/audit', label: 'Audit', icon: 'list' },
      { to: '/settings/account', label: 'Account', icon: 'user' },
    ],
  },
]

/** Every rail destination, flattened — used by the tests. */
export const NAV_ITEMS = [OVERVIEW_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)]

/** Page title for the browser tab, per route. Longest prefix wins. */
const TITLES = [
  ['/overview', 'Overview'],
  ['/organizations', 'Organisations'],
  ['/projects', 'Projects'],
  ['/users', 'Users'],
  ['/agents', 'Agents & Models'],
  ['/endpoints', 'AI Endpoints'],
  ['/credentials', 'Credentials'],
  ['/connectors', 'Connectors'],
  ['/audit', 'Audit'],
  ['/settings/account', 'Account'],
  ['/login', 'Sign in'],
]

export function pageTitleForPath(pathname) {
  const match = TITLES
    .filter(([path]) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b[0].length - a[0].length)[0]
  return match ? match[1] : undefined
}
