import { useCallback, useState } from 'react'
import axios from 'axios'
import { describeError, useResource } from './useApi'
import { apiUrl } from '../utils/apiBase'
import { useTenant } from '../contexts/TenantContext'

/**
 * Shared SCM connectors list + mutations (GitHub App / PAT).
 *
 * Same-origin `/api/connectors*` hits oam-api (BFF over ORA protocol). Nginx /
 * Vite proxy all `/api/` to oam-api — no ora-api proxy needed for this console.
 */
export function useConnectors({ skip = false } = {}) {
  const { organizationId, isPersonalAccount } = useTenant()
  const role = (typeof localStorage !== 'undefined' ? localStorage.getItem('role') : '') || ''
  const isPlatformAdmin = String(role).toLowerCase() === 'admin'
  // Unbound platform admin overview: cross-org list (mutations still ownership-scoped).
  const allOrgs = isPlatformAdmin && !isPersonalAccount
    && (!organizationId || organizationId === 'all')
  const listPath = allOrgs ? '/api/connectors?all_organizations=1' : '/api/connectors'
  const query = useResource(listPath, { fallback: { connectors: [] }, skip })
  const [busy, setBusy] = useState(false)

  const connectors = query.data?.connectors || []
  const githubAppConfigured = !!query.data?.github_app_configured
  const canEditOrg = !!query.data?.can_edit_org
  const canEditAdmin = !!query.data?.can_edit_admin
  const canEditUser = query.data?.can_edit_user !== false

  const connectPAT = useCallback(async ({ token, login, repos = [], scope = 'org' }) => {
    setBusy(true)
    try {
      const repoList = Array.isArray(repos)
        ? repos
        : String(repos || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      const { data } = await axios.post(apiUrl('/api/connectors/github/pat'), {
        token,
        login: login || 'pat-user',
        repos: repoList,
        scope,
      })
      await query.reload?.()
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: describeError(e) }
    } finally {
      setBusy(false)
    }
  }, [query])

  const openGitHubInstall = useCallback(async () => {
    // Preserve the click gesture: open a tab synchronously, then set the URL
    // after the async BFF call. window.open(..., 'noopener') after await is
    // often blocked and returns null — which previously looked like success.
    let popup = null
    try {
      popup = window.open('about:blank', '_blank')
    } catch {
      popup = null
    }
    try {
      const { data } = await axios.get(apiUrl('/api/connectors/github/install-url'))
      const url = typeof data?.install_url === 'string' ? data.install_url.trim() : ''
      if (!url) {
        try { popup?.close() } catch { /* ignore */ }
        return {
          ok: false,
          warn: true,
          error: data?.note || data?.message || 'GitHub App not configured',
        }
      }
      if (popup && !popup.closed) {
        try {
          popup.opener = null
          popup.location.href = url
          try { sessionStorage.setItem('oam_gh_install_pending', '1') } catch { /* ignore */ }
          return { ok: true, data }
        } catch {
          try { popup.close() } catch { /* ignore */ }
        }
      }
      // Popup blocked or inaccessible — same-tab navigation still completes install.
      try { sessionStorage.setItem('oam_gh_install_pending', '1') } catch { /* ignore */ }
      window.location.assign(url)
      return { ok: true, data, navigated: true }
    } catch (e) {
      try { popup?.close() } catch { /* ignore */ }
      return { ok: false, error: describeError(e) }
    }
  }, [])

  const updateConnector = useCallback(async (id, { account_login, display_name, token } = {}) => {
    if (!id) return { ok: false, error: 'Missing connector id' }
    setBusy(true)
    try {
      const body = { account_login, display_name }
      if (token && String(token).trim()) body.token = String(token).trim()
      const { data } = await axios.patch(apiUrl(`/api/connectors/${encodeURIComponent(id)}`), body)
      await query.reload?.()
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: describeError(e) }
    } finally {
      setBusy(false)
    }
  }, [query])

  const deleteConnector = useCallback(async (id) => {
    if (!id) return { ok: false, error: 'Missing connector id' }
    setBusy(true)
    try {
      await axios.delete(apiUrl(`/api/connectors/${encodeURIComponent(id)}`))
      await query.reload?.()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: describeError(e) }
    } finally {
      setBusy(false)
    }
  }, [query])

  const claimConnector = useCallback(async (id, claimToken) => {
    if (!id) return { ok: false, error: 'Missing connector id' }
    const token = String(claimToken || '').trim()
    if (!token) return { ok: false, error: 'claim_token required' }
    setBusy(true)
    try {
      const { data } = await axios.post(apiUrl(`/api/connectors/${encodeURIComponent(id)}/claim`), {
        claim_token: token,
      })
      await query.reload?.()
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: describeError(e) }
    } finally {
      setBusy(false)
    }
  }, [query])

  /** Bind a webhook-only pending App install (Setup callback missed). */
  const finishInstall = useCallback(async ({ installationId } = {}) => {
    setBusy(true)
    try {
      const body = {}
      const inst = String(installationId || '').trim()
      if (inst) body.installation_id = inst
      const { data } = await axios.post(apiUrl('/api/connectors/github/finish-install'), body)
      try { sessionStorage.removeItem('oam_gh_install_pending') } catch { /* ignore */ }
      await query.reload?.()
      return { ok: true, data }
    } catch (e) {
      const status = e?.response?.status
      const payload = e?.response?.data
      // Quiet "nothing to finish" — caller decides whether to toast.
      if (status === 409 && (payload?.error === 'no_install_intent' || payload?.error === 'no_pending_install')) {
        return { ok: false, quiet: true, error: describeError(e), data: payload }
      }
      return { ok: false, error: describeError(e), data: payload }
    } finally {
      setBusy(false)
    }
  }, [query])

  return {
    connectors,
    githubAppConfigured,
    canEditOrg,
    canEditAdmin,
    canEditUser,
    data: query.data,
    loading: query.loading,
    error: query.error,
    reload: query.reload,
    busy,
    connectPAT,
    openGitHubInstall,
    updateConnector,
    deleteConnector,
    claimConnector,
    finishInstall,
  }
}

export function connectorLabel(c) {
  if (!c) return ''
  const name = c.display_name || c.kind || 'connector'
  const who = c.account_login || c.installation_id || (c.id ? String(c.id).slice(0, 12) : '')
  const scope = c.scope ? ` · ${c.scope}` : ''
  return `${name} · ${who}${scope}${c.has_token ? '' : ' · no token'}`
}

/** Org/project from connector row or meta_json (ORA may embed before OAM sync lands). */
export function connectorTenancy(c) {
  if (!c) return { organizationId: '', projectId: '' }
  let organizationId = c.organization_id || ''
  let projectId = c.project_id || ''
  if ((!organizationId || !projectId) && c.meta_json) {
    try {
      const meta = JSON.parse(c.meta_json)
      organizationId = organizationId || meta.organization_id || ''
      projectId = projectId || meta.project_id || ''
    } catch { /* ignore */ }
  }
  return { organizationId, projectId }
}
