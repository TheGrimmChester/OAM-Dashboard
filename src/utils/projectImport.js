/**
 * Helpers for GitHub directory-project import on /projects.
 *
 * Slug suggestion mirrors OAM-API allocateProjectID’s short-name preference
 * (repo segment of owner/repo). Connector-diff decides whether an already-
 * imported discovered row needs “Update connectors”.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/

/** Stable key for a discovered (or project) GitHub identity. */
export function discoveryRowKey(row) {
  const extId = String(row?.external_id || '').trim()
  if (extId) return `id:${extId}`
  const key = normalizeExternalKey(row?.external_key || '')
  return key ? `key:${key}` : ''
}

export function normalizeExternalKey(raw) {
  const cleaned = String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length < 2) return ''
  const owner = parts[0].toLowerCase()
  const repo = parts[parts.length - 1].toLowerCase()
  if (!owner || !repo) return ''
  return `${owner}/${repo}`
}

/** Sanitize a string into a directory project id candidate. */
export function sanitizeDirectorySlug(raw) {
  let s = String(raw || '').trim().toLowerCase()
  s = s.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!s) return ''
  if (s.length > 63) s = s.slice(0, 63).replace(/-+$/g, '')
  if (s && !/^[a-z0-9]/.test(s)) {
    s = `p${s}`
    if (s.length > 63) s = s.slice(0, 63).replace(/-+$/g, '')
  }
  return ID_PATTERN.test(s) ? s : ''
}

/**
 * Prefer the repo short name as the directory id (server allocates on collision).
 */
export function suggestSlugFromExternalKey(externalKey) {
  const key = normalizeExternalKey(externalKey)
  if (!key) return ''
  const repo = key.split('/')[1]
  return sanitizeDirectorySlug(repo)
}

/**
 * Connector ids present on a discovered row but not yet on the matching project.
 * Empty when the row is not imported or every connector is already linked.
 */
export function connectorsNeedingAttach(discovered, projects) {
  if (!discovered?.already_imported || !discovered.project_id) return []
  const project = (projects || []).find((p) => p.id === discovered.project_id)
  const have = new Set((project?.connector_ids || []).map(String))
  return (discovered.connector_ids || []).filter((id) => {
    const cid = String(id || '').trim()
    return cid && !have.has(cid)
  })
}

/** Whether the operator can act on this discovered row (import or attach). */
export function discoveredRowActionable(discovered, projects) {
  if (!discovered) return false
  if (!discovered.already_imported) return (discovered.connector_ids || []).length > 0
  return connectorsNeedingAttach(discovered, projects).length > 0
}

export function isValidProjectId(id) {
  return ID_PATTERN.test(String(id || '').trim())
}

export { ID_PATTERN }
