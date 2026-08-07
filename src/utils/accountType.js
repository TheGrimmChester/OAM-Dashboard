/** Immutable account type from OAM login / user creation. */
export const ACCOUNT_TYPE_KEY = 'account_type'

export function readAccountType() {
  try {
    return localStorage.getItem(ACCOUNT_TYPE_KEY) || ''
  } catch {
    return ''
  }
}

export function readRole() {
  try {
    return localStorage.getItem('role') || ''
  } catch {
    return ''
  }
}

export function isPersonalAccount(type = readAccountType()) {
  return type === 'personal'
}

export function isOrganizationAccount(type = readAccountType()) {
  return type === 'organization'
}

/**
 * Directory nav visibility for Users / Organisations.
 *
 * Platform unbound admin (role=admin, not an organisation account): both.
 * Organisation account (any role): Users only (scoped server-side).
 * Personal non-admin: neither.
 */
export function directoryNavVisibility({ role = readRole(), accountType = readAccountType() } = {}) {
  const roleNorm = String(role || '').toLowerCase()
  const type = String(accountType || '').toLowerCase()
  if (type === 'organization') {
    return { users: true, organizations: false }
  }
  if (roleNorm === 'admin') {
    return { users: true, organizations: true }
  }
  return { users: false, organizations: false }
}

/** Create/update/delete users: unbound admin, or org editor/admin. */
export function canManageDirectoryUsers({ role = readRole(), accountType = readAccountType() } = {}) {
  const roleNorm = String(role || '').toLowerCase()
  const type = String(accountType || '').toLowerCase()
  if (type === 'organization') {
    return roleNorm === 'editor' || roleNorm === 'admin'
  }
  return roleNorm === 'admin'
}

/** Derive account_type when the API has not yet returned the field. */
export function inferAccountType(data) {
  const user = data?.user || data || {}
  if (data?.account_type) return data.account_type
  if (user.account_type) return user.account_type
  const orgId = data?.org_id || user.org_id || data?.organization_id || user.organization_id || ''
  return orgId ? 'organization' : 'personal'
}

/** Decode a JWT payload (no verification — the API verifies on use). */
export function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function persistAccountFromLogin(data) {
  const accountType = inferAccountType(data)
  localStorage.setItem(ACCOUNT_TYPE_KEY, accountType)
  const orgId = data?.org_id || data?.user?.org_id || data?.organization_id || data?.user?.organization_id || ''
  if (accountType === 'organization' && orgId) {
    localStorage.setItem('oam_organization_id', orgId)
  } else if (accountType === 'personal') {
    localStorage.removeItem('oam_organization_id')
  }
  return { accountType, orgId }
}

/** Persist account_type and org_id from a pasted or stored bearer token. */
export function persistAccountFromToken(token) {
  const claims = decodeJwtPayload(token)
  if (!claims) return { accountType: '', orgId: '' }
  return persistAccountFromLogin(claims)
}

export function userScopeLabel(accountType = readAccountType()) {
  return isPersonalAccount(accountType) ? 'My account' : 'My override'
}

export function endpointScopeOptions(accountType = readAccountType()) {
  if (isPersonalAccount(accountType)) {
    return [{ value: 'user', label: 'My account' }]
  }
  return [
    { value: 'org', label: 'Organisation — usable by everyone' },
    { value: 'user', label: 'My override' },
  ]
}

export function credentialScopeOptions(accountType = readAccountType()) {
  if (isPersonalAccount(accountType)) {
    return [{ value: 'user', label: 'My account' }]
  }
  return [
    { value: 'org', label: 'Organisation — everyone in this org' },
    { value: 'user', label: 'My override' },
    { value: 'admin', label: 'Admin — never served to a tenant caller' },
  ]
}
