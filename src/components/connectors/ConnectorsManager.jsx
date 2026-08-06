import React, { useEffect, useState } from 'react'
import { FiGitBranch, FiEdit2, FiTrash2, FiRefreshCw } from 'react-icons/fi'
import {
  Badge, Button, Card, CellStack, Code, EmptyState, Field, Grid, Input, Select, Stack, Table,
} from '@open-family/ui'
import { useConnectors, connectorLabel, connectorTenancy } from '../../hooks/useConnectors'
import { webhookModeLabel } from '../../lib/scmCheckers'
import WatchedReposPanel from './WatchedReposPanel'

const SCOPE_OPTIONS = {
  user: { value: 'user', label: 'user (personal)' },
  org: { value: 'org', label: 'org (shared defaults)' },
  admin: { value: 'admin', label: 'admin (isolated)' },
}

/**
 * Full SCM connector management UI — list, connect GitHub App / PAT, edit, delete.
 */
export default function ConnectorsManager({
  initialEditId = '',
  onFlash,
  footer = null,
  defaultScope = 'org',
  scopeFilter = '',
  readOnly = false,
}) {
  const {
    connectors: allConnectors,
    githubAppConfigured,
    canEditOrg,
    canEditAdmin,
    canEditUser,
    loading,
    error,
    reload,
    busy,
    connectPAT,
    openGitHubInstall,
    updateConnector,
    deleteConnector,
  } = useConnectors()

  const connectors = scopeFilter
    ? allConnectors.filter((c) => (c.scope || 'org') === scopeFilter)
    : allConnectors.filter((c) => {
      const s = c.scope || 'org'
      if (s === 'admin') return canEditAdmin || defaultScope === 'admin'
      return true
    })

  const allowedScopes = []
  if (canEditUser) allowedScopes.push('user')
  if (canEditOrg) allowedScopes.push('org')
  if (canEditAdmin) allowedScopes.push('admin')

  const effectiveDefault = allowedScopes.includes(defaultScope)
    ? defaultScope
    : (allowedScopes[0] || 'user')

  const [patForm, setPatForm] = useState({ token: '', login: '', repos: '', scope: effectiveDefault })
  const [editForm, setEditForm] = useState({ login: '', display_name: '', token: '' })
  const [editingId, setEditingId] = useState('')

  const flash = (tone, title, detail) => {
    onFlash?.(tone, title, detail)
  }

  useEffect(() => {
    setPatForm((f) => ({ ...f, scope: effectiveDefault }))
  }, [effectiveDefault])

  const scopeWritable = (scope) => {
    const s = scope || effectiveDefault
    if (s === 'admin') return canEditAdmin
    if (s === 'org') return canEditOrg
    return canEditUser
  }

  const activeScope = scopeFilter || patForm.scope || effectiveDefault
  const formReadOnly = readOnly || !scopeWritable(activeScope) || allowedScopes.length === 0

  useEffect(() => {
    if (!initialEditId || !connectors.length) return
    const c = connectors.find((x) => x.id === initialEditId)
    if (c) beginEdit(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId, connectors.length])

  const beginEdit = (c) => {
    if (!c?.id) return
    setEditingId(c.id)
    let display = c.display_name || ''
    if (!display && c.meta_json) {
      try {
        display = JSON.parse(c.meta_json)?.display_name || ''
      } catch { /* ignore */ }
    }
    setEditForm({
      login: c.account_login || '',
      display_name: display || '',
      token: '',
    })
  }

  const handleConnectPAT = async () => {
    if (formReadOnly) return
    const scope = patForm.scope || effectiveDefault
    if (!scopeWritable(scope)) {
      flash('error', 'Not allowed', `Cannot create ${scope}-scoped connectors`)
      return
    }
    const result = await connectPAT({ ...patForm, scope })
    if (result.ok) {
      flash('ok', 'GitHub PAT connected', result.data?.honesty)
      setPatForm((f) => ({ token: '', login: f.login, repos: f.repos, scope: f.scope }))
      const id = result.data?.connector?.id
      if (id) {
        beginEdit({ id, account_login: patForm.login, display_name: '', meta_json: '{}', scope })
        setEditingId(id)
      }
    } else {
      flash('error', 'PAT connect failed', result.error)
    }
  }

  const handleGitHubInstall = async () => {
    if (formReadOnly || !canEditOrg) return
    const result = await openGitHubInstall()
    if (result.ok) return
    if (result.warn) flash('warn', 'GitHub App not configured', result.error)
    else flash('error', 'Install URL failed', result.error)
  }

  const handleSaveEdit = async () => {
    if (formReadOnly || !editingId) {
      if (!editingId) flash('warn', 'Select a connector first')
      return
    }
    const result = await updateConnector(editingId, {
      account_login: editForm.login,
      display_name: editForm.display_name,
      token: editForm.token,
    })
    if (result.ok) {
      flash('ok', 'Connector updated', result.data?.connector?.account_login || editingId)
      setEditForm((f) => ({ ...f, token: '' }))
      setEditingId('')
    } else {
      flash('error', 'Connector update failed', result.error)
    }
  }

  const handleDelete = async (id) => {
    if (formReadOnly || !id) return
    if (!window.confirm(`Delete connector ${id}? Watched repos for it will be disabled.`)) return
    const result = await deleteConnector(id)
    if (result.ok) {
      flash('ok', 'Connector deleted', id)
      if (editingId === id) setEditingId('')
    } else {
      flash('error', 'Delete failed', result.error)
    }
  }

  const rowWritable = (c) => !readOnly && scopeWritable(c.scope || scopeFilter || 'org')
  const anyRowWritable = connectors.some((c) => rowWritable(c))

  return (
    <Stack>
      <Card
        title={<><FiGitBranch /> {scopeFilter ? `Connectors · ${scopeFilter}` : 'Active connectors'}</>}
        description={(
          <>
            GitHub App is production (webhooks + Check Runs). PAT + repo hooks work without an App.
            App configured: {githubAppConfigured ? 'yes' : 'no'}.
            {' '}Every connector is scoped to an organisation and project in OAM.
          </>
        )}
        actions={(
          <>
            {!formReadOnly && canEditOrg && defaultScope !== 'user' && (
              <Button size="sm" variant="secondary" onClick={handleGitHubInstall}>
                Connect GitHub App
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<FiRefreshCw />} onClick={() => reload?.()}>
              Refresh
            </Button>
          </>
        )}
        flush
      >
        <Table
          aria-label={scopeFilter ? `Connectors at ${scopeFilter} scope` : 'Active connectors'}
          state={loading ? 'loading' : error ? 'error' : connectors.length ? 'ready' : 'empty'}
          columns={[
            {
              key: 'connector',
              header: 'Connector',
              render: (c) => <CellStack primary={connectorLabel(c)} secondary={c.id} />,
            },
            {
              key: 'tenancy',
              header: 'Org / project',
              render: (c) => {
                const { organizationId, projectId } = connectorTenancy(c)
                return (
                  <CellStack
                    primary={organizationId || '(unset)'}
                    secondary={projectId || '(unset)'}
                  />
                )
              },
            },
            {
              key: 'ingress',
              header: 'Ingress',
              render: (c) => {
                const mode = webhookModeLabel(c.webhook_mode)
                return <Badge tone={mode.tone} title={mode.hint}>{mode.label}</Badge>
              },
            },
            {
              key: 'scope',
              header: 'Scope',
              render: (c) => <Badge>{c.scope || 'org'}</Badge>,
            },
            {
              key: 'credentials',
              header: 'Credentials',
              render: (c) => (c.has_token
                ? <Badge tone="good" dot>available</Badge>
                : <Badge tone="warning" dot>no decryptable token</Badge>),
            },
          ]}
          rows={connectors}
          getRowKey={(c) => c.id}
          isRowSelected={(c) => c.id === editingId}
          onRowClick={anyRowWritable ? (c) => { if (rowWritable(c)) beginEdit(c) } : undefined}
          rowActions={anyRowWritable
            ? (c) => (rowWritable(c)
              ? [
                { label: 'Edit connector', icon: <FiEdit2 />, disabled: busy, onSelect: () => beginEdit(c) },
                { separator: true },
                { label: 'Delete connector', icon: <FiTrash2 />, danger: true, disabled: busy, onSelect: () => handleDelete(c.id) },
              ]
              : [{ label: 'Managed at another scope', disabled: true }])
            : undefined}
          emptyState={(
            <EmptyState
              inline
              icon={<FiGitBranch />}
              title={scopeFilter ? `No connectors at ${scopeFilter} scope` : 'No connectors yet'}
              description={scopeFilter
                ? `Nothing is connected at ${scopeFilter} scope. Connectors at other scopes are hidden on this view.`
                : 'Connect a GitHub App installation or bootstrap a PAT and repositories become listable within a minute.'}
            />
          )}
          errorState={(
            <EmptyState
              inline
              title="Connectors failed to load"
              description={typeof error === 'string' ? error : JSON.stringify(error)}
              actions={<Button variant="primary" icon={<FiRefreshCw />} onClick={() => reload?.()}>Retry</Button>}
            />
          )}
        />
      </Card>

      {!formReadOnly && (
        <Card
          title="Connect a GitHub PAT"
          description="Bootstrap path for local and dev. Production connectors are GitHub App installations."
        >
          <Grid columns={2}>
            <Field label="PAT token" htmlFor="pat-token">
              <Input
                id="pat-token"
                type="password"
                className="oui-mono"
                value={patForm.token}
                onChange={(e) => setPatForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="ghp_… (or any token when mock)"
              />
            </Field>
            <Field label="Login" htmlFor="pat-login">
              <Input
                id="pat-login"
                value={patForm.login}
                onChange={(e) => setPatForm((f) => ({ ...f, login: e.target.value }))}
                placeholder="github-user"
              />
            </Field>
            <Field label="Extra repos (optional)" htmlFor="pat-repos" hint="Only needed if a repo is not in the connector's list.">
              <Input
                id="pat-repos"
                className="oui-mono"
                value={patForm.repos}
                onChange={(e) => setPatForm((f) => ({ ...f, repos: e.target.value }))}
                placeholder="org/name … if not in list"
              />
            </Field>
            {!scopeFilter && allowedScopes.length > 1 && (
              <Field label="Scope" htmlFor="pat-scope">
                <Select
                  id="pat-scope"
                  options={allowedScopes.map((s) => SCOPE_OPTIONS[s])}
                  value={patForm.scope || effectiveDefault}
                  onChange={(e) => setPatForm((f) => ({ ...f, scope: e.target.value }))}
                />
              </Field>
            )}
          </Grid>
          <div className="oui-row">
            <Button
              variant="primary"
              disabled={busy || !patForm.token}
              onClick={handleConnectPAT}
            >
              Connect PAT
            </Button>
          </div>
        </Card>
      )}

      {!formReadOnly && editingId && (
        <>
          <Card
            title={<>Edit connector <Code>{editingId}</Code></>}
            footer={(
              <div className="oui-row">
                <Button variant="primary" disabled={busy} onClick={handleSaveEdit}>Save</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setEditingId('')}>Cancel</Button>
              </div>
            )}
          >
            <Grid columns={3}>
              <Field label="Login label" htmlFor="edit-login">
                <Input
                  id="edit-login"
                  value={editForm.login}
                  onChange={(e) => setEditForm((f) => ({ ...f, login: e.target.value }))}
                  placeholder="github-user"
                />
              </Field>
              <Field label="Display name" htmlFor="edit-display-name">
                <Input
                  id="edit-display-name"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="optional"
                />
              </Field>
              <Field label="Replace PAT (optional)" htmlFor="edit-token">
                <Input
                  id="edit-token"
                  type="password"
                  className="oui-mono"
                  value={editForm.token}
                  onChange={(e) => setEditForm((f) => ({ ...f, token: e.target.value }))}
                  placeholder="ghp_… leave blank to keep"
                />
              </Field>
            </Grid>
          </Card>
          <WatchedReposPanel
            connectorId={editingId}
            connector={connectors.find((x) => x.id === editingId)}
            onFlash={flash}
            readOnly={formReadOnly}
          />
        </>
      )}

      {footer}
    </Stack>
  )
}
