/**
 * Family SCM checkers — which products receive ORA fan-out for a watched repo.
 * Matches OPA-Stack interop compatibility matrix.
 */
export const FAMILY_SCM_CHECKERS = [
  {
    key: 'ora:review',
    product: 'ORA',
    label: 'Code review',
    description: 'AI PR review and Repo Watch',
    default: true,
  },
  {
    key: 'osa:dependencies',
    product: 'OSA',
    label: 'Dependencies (CVE)',
    description: 'Lockfile CVE scan on PR/push',
    default: true,
  },
  {
    key: 'opl:perf-gate',
    product: 'OPL',
    label: 'Perf gate',
    description: 'Load scenario when JMX/HAR paths change',
    default: false,
  },
  {
    key: 'opm:delivery',
    product: 'OPM',
    label: 'Delivery',
    description: 'Task sync on merge / issue events',
    default: false,
  },
]

/** Badge tone for webhook ingress mode */
export function webhookModeLabel(mode) {
  const m = String(mode || 'app').toLowerCase()
  if (m === 'repo') {
    return { label: 'Repo hooks', tone: 'warning', hint: 'PAT + per-repo GitHub hooks (no App required)' }
  }
  return { label: 'GitHub App', tone: 'good', hint: 'App installation webhooks + Check Runs' }
}

export function defaultChecksForRepo() {
  return FAMILY_SCM_CHECKERS.filter((c) => c.default).map((c) => c.key)
}

export function checkerPreviewLabels(checks) {
  const list = Array.isArray(checks) && checks.length ? checks : defaultChecksForRepo()
  return list.map((key) => {
    const found = FAMILY_SCM_CHECKERS.find((c) => c.key === key)
    return found || { key, product: key.split(':')[0]?.toUpperCase(), label: key }
  })
}
