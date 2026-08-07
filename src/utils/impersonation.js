import {
  decodeJwtPayload,
  persistAccountFromLogin,
  persistAccountFromToken,
  readRole,
} from './accountType'

/** Stashed admin session while acting as another user. */
export const ADMIN_TOKEN_KEY = 'oam_admin_token'
export const ADMIN_SESSION_KEY = 'oam_admin_session'

/**
 * Impersonate is admin-only. Org admins are limited server-side to their org;
 * unbound platform admins may target anyone.
 */
export function canImpersonate({ role = readRole(), impersonating = isImpersonating() } = {}) {
  if (impersonating) return false
  return String(role || '').toLowerCase() === 'admin'
}

export function isImpersonating() {
  try {
    return Boolean(localStorage.getItem(ADMIN_TOKEN_KEY))
  } catch {
    return false
  }
}

export function readAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function readImpersonator() {
  const session = readAdminSession()
  if (session?.username) return String(session.username)
  try {
    const claims = decodeJwtPayload(localStorage.getItem('auth_token'))
    return claims?.impersonator ? String(claims.impersonator) : ''
  } catch {
    return ''
  }
}

function snapshotAdminSession() {
  return {
    username: localStorage.getItem('username') || '',
    role: localStorage.getItem('role') || '',
    account_type: localStorage.getItem('account_type') || '',
    organization_id: localStorage.getItem('oam_organization_id') || '',
  }
}

function applySessionIdentity({ username, role, account_type, organization_id, token, loginPayload }) {
  if (token) localStorage.setItem('auth_token', token)
  if (username != null) localStorage.setItem('username', username)
  if (role != null) localStorage.setItem('role', role)
  if (loginPayload) {
    persistAccountFromLogin(loginPayload)
  } else if (token) {
    persistAccountFromToken(token)
  } else if (account_type != null) {
    localStorage.setItem('account_type', account_type)
    if (account_type === 'organization' && organization_id) {
      localStorage.setItem('oam_organization_id', organization_id)
    } else if (account_type === 'personal') {
      localStorage.removeItem('oam_organization_id')
    } else if (organization_id) {
      localStorage.setItem('oam_organization_id', organization_id)
    } else {
      localStorage.removeItem('oam_organization_id')
    }
  }
}

/** Stash the current admin token, then apply the impersonation response. */
export function beginImpersonation(data) {
  const token = data?.token
  if (!token) throw new Error('impersonation response had no token')
  if (isImpersonating()) throw new Error('already impersonating — stop first')

  const adminToken = localStorage.getItem('auth_token')
  if (!adminToken) throw new Error('no admin token to stash')

  localStorage.setItem(ADMIN_TOKEN_KEY, adminToken)
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(snapshotAdminSession()))

  applySessionIdentity({
    token,
    username: data.username || '',
    role: data.role || '',
    loginPayload: data,
  })
}

/** Restore the stashed admin session after stop. */
export function endImpersonation() {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY)
  const session = readAdminSession() || {}
  if (!adminToken) {
    clearImpersonationStash()
    throw new Error('no stashed admin token — sign in again')
  }

  applySessionIdentity({
    token: adminToken,
    username: session.username || '',
    role: session.role || '',
    account_type: session.account_type || '',
    organization_id: session.organization_id || '',
  })
  clearImpersonationStash()
}

export function clearImpersonationStash() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
