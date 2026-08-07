/** Family product codes on directory projects (denylist in disabled_products). */
export const PRODUCT_CODES = ['opa', 'osa', 'ora', 'opl', 'opm']

export const PRODUCT_LABELS = {
  opa: 'OPA',
  osa: 'OSA',
  ora: 'ORA',
  opl: 'OPL',
  opm: 'OPM',
}

export function disabledProductsList(row) {
  return (row?.disabled_products || []).map((p) => String(p).toLowerCase()).filter(Boolean)
}

export function productAccessSummary(row) {
  const disabled = disabledProductsList(row)
  const enabled = PRODUCT_CODES.filter((c) => !disabled.includes(c))
  if (!disabled.length) return 'All products enabled'
  if (!enabled.length) return 'All products disabled'
  return [
    `Enabled: ${enabled.map((c) => PRODUCT_LABELS[c]).join(', ')}`,
    `Disabled: ${disabled.map((c) => PRODUCT_LABELS[c] || c).join(', ')}`,
  ].join(' · ')
}

function tenantIds(project) {
  // Never invent default-org — personal / unbound projects keep blank org.
  const organizationId = String(project?.organization_id || '').trim()
  const projectId = String(project?.id || '').trim()
  return { organizationId, projectId }
}

/**
 * Snippets for OPA collectors + family tenant headers.
 * Pass ingestKey (plaintext) when available — shown once after mint/rotate.
 */
export function collectorSnippets(project, ingestKey = '') {
  const { organizationId: org, projectId: id } = tenantIds(project)
  const key = String(ingestKey || '').trim()
  const keyLine = key ? `OPA_INGEST_KEY=${key}` : 'OPA_INGEST_KEY=<paste-key>'
  const iniKey = key ? `opa.ingest_key=${key}` : 'opa.ingest_key=<paste-key>'

  const phpIni = [
    org ? `opa.organization_id=${org}` : '; opa.organization_id=  (empty for personal)',
    id ? `opa.project_id=${id}` : '; opa.project_id=',
    iniKey,
  ].join('\n')

  const phpEnv = [
    org ? `OPA_ORGANIZATION_ID=${org}` : '# OPA_ORGANIZATION_ID=  (empty for personal)',
    id ? `OPA_PROJECT_ID=${id}` : '# OPA_PROJECT_ID=',
    keyLine,
  ].join('\n')

  const nodeEnv = phpEnv
  const pythonEnv = phpEnv
  const collectorEnv = [
    ...phpEnv.split('\n'),
    '# or: opa-collector -ingest-key <key> …',
  ].join('\n')

  const rum = [
    `<!-- script tag -->`,
    `<script src="opa-rum.js"`,
    org ? `  data-organization-id="${org}"` : '  data-organization-id=""',
    id ? `  data-project-id="${id}"` : '  data-project-id=""',
    key ? `  data-ingest-key="${key}"` : '  data-ingest-key="<paste-key>"',
    `  data-endpoint="https://opa-agent.example"></script>`,
    '',
    '// or window.OPA_RUM_CONFIG',
    `OPA_RUM_CONFIG = {`,
    `  organizationId: ${JSON.stringify(org)},`,
    `  projectId: ${JSON.stringify(id)},`,
    `  ingestKey: ${JSON.stringify(key || '<paste-key>')},`,
    `  endpoint: 'https://opa-agent.example',`,
    `}`,
  ].join('\n')

  const otlp = [
    '# OTLP/HTTP exporters (Authorization Bearer)',
    `Authorization: Bearer ${key || '<paste-key>'}`,
    org ? `# optional resource attrs (overwritten by key when auth required): organization_id=${org}` : '',
    id ? `# optional resource attrs: project_id=${id}` : '',
  ].filter(Boolean).join('\n')

  const headers = [
    org ? `X-Organization-ID: ${org}` : '# X-Organization-ID:  (omit when empty)',
    id ? `X-Project-ID: ${id}` : '# X-Project-ID:',
  ].join('\n')

  const full = [
    '; OPA PHP extension (opa.ini / conf.d)',
    phpIni,
    '',
    '# Environment (PHP / node / python / collector)',
    phpEnv,
    '',
    '# RUM',
    rum,
    '',
    '# OTLP',
    otlp,
    '',
    '# Family API tenant headers',
    headers,
  ].join('\n')

  return {
    phpIni,
    phpEnv,
    nodeEnv,
    pythonEnv,
    collectorEnv,
    rum,
    otlp,
    headers,
    full,
    organizationId: org,
    projectId: id,
    ingestKey: key,
  }
}

/** @deprecated use collectorSnippets */
export function phpExtensionSnippets(project, ingestKey = '') {
  const s = collectorSnippets(project, ingestKey)
  return {
    ini: s.phpIni,
    env: s.phpEnv,
    headers: s.headers,
    full: s.full,
    organizationId: s.organizationId,
    projectId: s.projectId,
  }
}
