import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import axios from 'axios'
import { projectScopeHeaders } from '@open-family/ui'
import { apiUrl } from '../utils/apiBase'
import {
  isOrganizationAccount, isPersonalAccount, readAccountType,
} from '../utils/accountType'
import {
  ALL,
  isMutatingMethod,
  isProjectDirectoryRequest,
  persistProjectSelection,
  projectIdFromSelection,
  readProjectSelection,
  tenantScopeKey,
} from '../utils/projectScope'

/**
 * The org/project scope every read and write on this console is made in.
 *
 * This matters more here than on a telemetry dashboard. Credentials and model
 * bindings are *scoped objects*: the same logical key exists once per
 * organisation, and a binding set while the picker says "Acme" applies to Acme
 * and to nobody else. So the selection is not a filter — it is part of the
 * identity of what you are about to write, which is why it is sent on every
 * request as X-Organization-ID / X-Project-ID (or list-only X-Project-IDs)
 * rather than only on GETs.
 *
 * Project selection is `'all' | string[]`. UI All stamps `X-Project-IDs` with the
 * enabled directory ids — it does **not** send auth's `X-Project-ID: all`.
 * Mutations stamp a concrete `X-Project-ID` only when exactly one project is
 * selected; All / multi-select omit it so the API can write org/user-global rows
 * (OAM collapses empty project to default-project on credentials, endpoints,
 * agents, and connectors).
 */

const ORG_KEY = 'oam_organization_id'
const PROJECT_KEY = 'oam_project_id'
const SELECTION_KEY = 'oam_project_selection'

export { ALL }

/**
 * The current scope, held outside React and read at *request* time.
 *
 * This is deliberately not derived from state inside the interceptor's closure.
 * An interceptor re-registered by an effect keyed on `[organizationId]` is one
 * commit behind its own provider: React runs a child's effects before its
 * parent's, so a page that refetches when the organisation changes sends its
 * request through the interceptor that still carries the *previous* org. The
 * observable symptom was the whole point of the Agents & Models page failing —
 * the header read "acme" while every row showed the family default, because the
 * lookups had gone out scoped to the org before it.
 *
 * Worse than a stale read: the same interceptor stamps writes, so the console
 * could show one organisation and save into another.
 *
 * Holding the scope in a mutable module value and updating it synchronously in
 * the setter removes the ordering question entirely — whatever request goes out
 * next carries whatever the switcher last said, regardless of effect order.
 */
function lockedOrgId() {
  if (!isOrganizationAccount()) return null
  const org = localStorage.getItem(ORG_KEY)
  return org && org !== ALL ? org : null
}

function initialOrganizationId() {
  const locked = lockedOrgId()
  if (locked) return locked
  if (isPersonalAccount()) return ALL
  return localStorage.getItem(ORG_KEY) || ALL
}

const scope = {
  organizationId: initialOrganizationId(),
  selection: readProjectSelection(SELECTION_KEY, PROJECT_KEY),
  enabledProjectIds: [],
}

/**
 * The headers as they would be stamped right now.
 *
 * Exported so the ordering guarantee above is a test and not a comment: a header
 * builder that reads live state cannot be one commit stale, and
 * `tenantScope.test.js` asserts that a scope change is visible to the very next
 * call with no render in between.
 *
 * `opts.url` / `opts.method` mirror the axios config so directory fetches skip
 * the project filter and mutations only send a concrete `X-Project-ID`.
 */
export function currentScopeHeaders(opts = {}) {
  const headers = {}
  if (!isPersonalAccount()) {
    const orgId = lockedOrgId() || scope.organizationId || ALL
    headers['X-Organization-ID'] = orgId
  }

  const url = opts.url || ''
  if (isProjectDirectoryRequest(url)) {
    return headers
  }

  if (isMutatingMethod(opts.method)) {
    if (scope.selection !== ALL && Array.isArray(scope.selection) && scope.selection.length === 1) {
      headers['X-Project-ID'] = scope.selection[0]
    }
    return headers
  }

  if (scope.selection === ALL && (!scope.enabledProjectIds || scope.enabledProjectIds.length === 0)) {
    return headers
  }

  Object.assign(headers, projectScopeHeaders(scope.selection, scope.enabledProjectIds))
  return headers
}

/** Set the scope without React. Used by the provider's setters and the tests. */
export function setScope({ organizationId, selection, enabledProjectIds, projectId }) {
  if (organizationId !== undefined) scope.organizationId = organizationId
  if (enabledProjectIds !== undefined) {
    scope.enabledProjectIds = Array.isArray(enabledProjectIds) ? enabledProjectIds.map(String) : []
  }
  if (selection !== undefined) {
    scope.selection = selection === ALL || !selection?.length ? ALL : [...selection]
  } else if (projectId !== undefined) {
    // Test / legacy helper: a single projectId maps onto selection.
    scope.selection = !projectId || projectId === ALL ? ALL : [String(projectId)]
  }
}

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [accountType] = useState(() => readAccountType())
  const [organizationId, setOrganizationId] = useState(scope.organizationId)
  const [selection, setSelectionState] = useState(scope.selection)
  const orgLocked = isOrganizationAccount(accountType) && !!lockedOrgId()
  const [organizations, setOrganizations] = useState([])
  const [projects, setProjects] = useState([])
  const [nonce, setNonce] = useState(0)

  const projectId = projectIdFromSelection(selection)
  const scopeKey = useMemo(
    () => tenantScopeKey(organizationId, selection),
    [organizationId, selection],
  )
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  // Installed once, for the life of the app. The values are read from `scope` on
  // each request rather than captured, so there is no version of this
  // interceptor that can be out of date.
  useEffect(() => {
    const id = axios.interceptors.request.use((config) => {
      config.headers = config.headers || {}
      delete config.headers['X-Project-ID']
      delete config.headers['X-Project-IDs']
      Object.assign(config.headers, currentScopeHeaders({
        url: config.url || '',
        method: config.method,
      }))
      return config
    })
    return () => axios.interceptors.request.eject(id)
  }, [])

  useEffect(() => {
    let active = true
    axios.get(apiUrl('/api/organizations'))
      .then((r) => { if (active) setOrganizations(r.data?.organizations || []) })
      .catch(() => { if (active) setOrganizations([]) })
    return () => { active = false }
  }, [nonce])

  useEffect(() => {
    let active = true
    axios.get(apiUrl('/api/projects'))
      .then((r) => {
        if (!active) return
        const list = r.data?.projects || []
        setProjects(list)
        const ids = list.map((p) => String(p.id)).filter(Boolean)
        setScope({ enabledProjectIds: ids })
      })
      .catch(() => {
        if (!active) return
        setProjects([])
        setScope({ enabledProjectIds: [] })
      })
    return () => { active = false }
  }, [nonce, organizationId])

  const selectOrganization = useCallback((id) => {
    if (orgLocked || isPersonalAccount(accountType)) return
    // `scope` first, and synchronously: any request a re-render triggers must
    // already see the new organisation. A project belongs to an organisation, so
    // keeping the old project selected across an org switch would send a scope
    // pair that cannot exist.
    persistProjectSelection(SELECTION_KEY, PROJECT_KEY, ALL)
    setScope({ organizationId: id, selection: ALL })
    localStorage.setItem(ORG_KEY, id)
    setOrganizationId(id)
    setSelectionState(ALL)
  }, [accountType, orgLocked])

  const setProjectSelection = useCallback((next) => {
    const saved = persistProjectSelection(SELECTION_KEY, PROJECT_KEY, next)
    setScope({ selection: saved })
    setSelectionState(saved)
  }, [])

  /** Compat: single id or `all`. Prefer `setProjectSelection` for multi. */
  const selectProject = useCallback((id) => {
    setProjectSelection(!id || id === ALL ? ALL : [String(id)])
  }, [setProjectSelection])

  const value = useMemo(() => ({
    organizationId,
    projectId,
    selection,
    scopeKey,
    setProjectSelection,
    organizations,
    projects,
    selectOrganization,
    selectProject,
    refresh,
    nonce,
    accountType,
    isPersonalAccount: isPersonalAccount(accountType),
    orgLocked,
    hasConcreteProject: selection !== ALL && selection.length === 1,
    /** True when two or more projects are checked (list filter; writes still org-global). */
    selectionIsMulti: selection !== ALL && Array.isArray(selection) && selection.length > 1,
    /** What a write will be attributed to, in words, for a page to show. */
    scopeLabel: isPersonalAccount(accountType)
      ? 'your personal account'
      : (organizationId === ALL ? 'no organisation' : organizationId),
  }), [organizationId, projectId, selection, scopeKey, setProjectSelection, organizations, projects, selectOrganization, selectProject, refresh, nonce, accountType, orgLocked])

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used inside a TenantProvider')
  return ctx
}
