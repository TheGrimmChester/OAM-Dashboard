import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import axios from 'axios'
import { apiUrl } from '../utils/apiBase'
import {
  isOrganizationAccount, isPersonalAccount, readAccountType,
} from '../utils/accountType'

/**
 * The org/project scope every read and write on this console is made in.
 *
 * This matters more here than on a telemetry dashboard. Credentials and model
 * bindings are *scoped objects*: the same logical key exists once per
 * organisation, and a binding set while the picker says "Acme" applies to Acme
 * and to nobody else. So the selection is not a filter — it is part of the
 * identity of what you are about to write, which is why it is sent on every
 * request as X-Organization-ID / X-Project-ID rather than only on GETs.
 *
 * `all` is the picker's own marker for "unscoped", and the service collapses it
 * to its default when auth is enforced. Writing while it is selected is allowed
 * (the service decides the target), but the pages say what they are about to
 * write to, because "I thought I was editing Acme" is the failure mode.
 */

const ORG_KEY = 'oam_organization_id'
const PROJECT_KEY = 'oam_project_id'
export const ALL = 'all'

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
  projectId: localStorage.getItem(PROJECT_KEY) || ALL,
}

/**
 * The headers as they would be stamped right now.
 *
 * Exported so the ordering guarantee above is a test and not a comment: a header
 * builder that reads live state cannot be one commit stale, and
 * `tenantScope.test.js` asserts that a scope change is visible to the very next
 * call with no render in between.
 */
export function currentScopeHeaders() {
  if (isPersonalAccount()) {
    return { 'X-Project-ID': scope.projectId || ALL }
  }
  const orgId = lockedOrgId() || scope.organizationId || ALL
  return {
    'X-Organization-ID': orgId,
    'X-Project-ID': scope.projectId || ALL,
  }
}

/** Set the scope without React. Used by the provider's setters and the tests. */
export function setScope({ organizationId, projectId }) {
  if (organizationId !== undefined) scope.organizationId = organizationId
  if (projectId !== undefined) scope.projectId = projectId
}

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [accountType] = useState(() => readAccountType())
  const [organizationId, setOrganizationId] = useState(scope.organizationId)
  const [projectId, setProjectId] = useState(scope.projectId)
  const orgLocked = isOrganizationAccount(accountType) && !!lockedOrgId()
  const [organizations, setOrganizations] = useState([])
  const [projects, setProjects] = useState([])
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  // Installed once, for the life of the app. The values are read from `scope` on
  // each request rather than captured, so there is no version of this
  // interceptor that can be out of date.
  useEffect(() => {
    const id = axios.interceptors.request.use((config) => {
      config.headers = config.headers || {}
      Object.assign(config.headers, currentScopeHeaders())
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
      .then((r) => { if (active) setProjects(r.data?.projects || []) })
      .catch(() => { if (active) setProjects([]) })
    return () => { active = false }
  }, [nonce, organizationId])

  const selectOrganization = useCallback((id) => {
    if (orgLocked || isPersonalAccount(accountType)) return
    // `scope` first, and synchronously: any request a re-render triggers must
    // already see the new organisation. A project belongs to an organisation, so
    // keeping the old project selected across an org switch would send a scope
    // pair that cannot exist.
    setScope({ organizationId: id, projectId: ALL })
    localStorage.setItem(ORG_KEY, id)
    localStorage.setItem(PROJECT_KEY, ALL)
    setOrganizationId(id)
    setProjectId(ALL)
  }, [accountType, orgLocked])

  const selectProject = useCallback((id) => {
    setScope({ projectId: id })
    localStorage.setItem(PROJECT_KEY, id)
    setProjectId(id)
  }, [])

  const value = useMemo(() => ({
    organizationId,
    projectId,
    organizations,
    projects,
    selectOrganization,
    selectProject,
    refresh,
    nonce,
    accountType,
    isPersonalAccount: isPersonalAccount(accountType),
    orgLocked,
    /** What a write will be attributed to, in words, for a page to show. */
    scopeLabel: isPersonalAccount(accountType)
      ? 'your personal account'
      : (organizationId === ALL ? 'the default organisation' : organizationId),
  }), [organizationId, projectId, organizations, projects, selectOrganization, selectProject, refresh, nonce, accountType, orgLocked])

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used inside a TenantProvider')
  return ctx
}
