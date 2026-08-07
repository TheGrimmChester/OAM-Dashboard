import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PageHeader, Card, Stack, Table, Button, Field, Input, Banner, EmptyState,
  Badge, CellStack, Checkbox, useToast,
} from '@open-family/ui'
import { FiFolder, FiPlus, FiTrash2, FiGithub, FiRefreshCw } from 'react-icons/fi'
import { useResource, post, tableState } from '../hooks/useApi'
import { useTenant, ALL } from '../contexts/TenantContext'
import {
  ID_PATTERN,
  discoveryRowKey,
  connectorsNeedingAttach,
  discoveredRowActionable,
} from '../utils/projectImport'
import { PRODUCT_CODES, PRODUCT_LABELS } from '../utils/projectDetail'

function disabledList(row) {
  return (row?.disabled_products || []).map((p) => String(p).toLowerCase()).filter(Boolean)
}

function isProductEnabled(row, code) {
  return !disabledList(row).includes(code)
}

function NewProject({ onDone, onCancel }) {
  const toast = useToast()
  const { scopeLabel } = useTenant()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const idError = id && !ID_PATTERN.test(id)
    ? 'Lower-case letters, digits, hyphen and underscore; must start with a letter or digit.'
    : null

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      // Manual create only — GitHub metadata must go through /api/projects/import.
      // disabled_products defaults to [] (all products on) server-side.
      await post('/api/projects/set', { id: id.trim(), name })
      toast.push({ tone: 'success', title: `${id.trim()} created` })
      onDone()
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack>
      {error ? <Banner tone="danger" title="Could not save">{error}</Banner> : null}
      <Banner tone="accent" title={`This project will belong to ${scopeLabel}`}>
        For OPA/OPL and any scope that does not need a repository. Switch organisations
        in the top bar before creating it if that is not what you want. All family products
        start enabled; adjust access in the table after creating.
      </Banner>
      <div className="oam-binding-editor">
        <Field label="Identifier" error={idError}>
          <Input value={id} onChange={(e) => setId(e.target.value)} invalid={!!idError} placeholder="checkout-api" />
        </Field>
        <Field label="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout API" />
        </Field>
      </div>
      <div className="oam-form-actions">
        <Button variant="primary" loading={busy} disabled={!id.trim() || !!idError} onClick={save}>
          Create project
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Stack>
  )
}

function ConnectorChips({ ids }) {
  const list = (ids || []).filter(Boolean)
  if (!list.length) return <span className="oam-inherited-value">—</span>
  return (
    <div className="oam-chip-row">
      {list.map((id) => (
        <Badge key={id} tone="neutral" title={id}>{id}</Badge>
      ))}
    </div>
  )
}

/**
 * Discovered GitHub repos for the current organisation or personal account.
 *
 * Loads when the panel is open and tenancy is ready. Import is always an
 * explicit multi-select action — never a silent mass-create.
 */
function ImportFromGitHub({ projects, onDone, onCancel }) {
  const toast = useToast()
  const { organizationId, isPersonalAccount } = useTenant()
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  // Personal accounts discover via their own connectors (no org query).
  // Organisation accounts need a concrete org in the top bar.
  const scopeReady = isPersonalAccount || (organizationId && organizationId !== ALL)
  const discoveredPath = (!isPersonalAccount && organizationId && organizationId !== ALL)
    ? `/api/projects/discovered?organization_id=${encodeURIComponent(organizationId)}`
    : '/api/projects/discovered'

  const discovery = useResource(discoveredPath, {
    fallback: { discovered: [], note: '', errors: [] },
    deps: [organizationId, isPersonalAccount],
    skip: !scopeReady,
  })

  const rows = discovery.data?.discovered || []
  const peerErrors = discovery.data?.errors || []
  const note = discovery.data?.note || ''

  const selectableKeys = useMemo(
    () => rows.filter((r) => discoveredRowActionable(r, projects)).map(discoveryRowKey).filter(Boolean),
    [rows, projects],
  )

  const toggle = (key) => {
    if (!key) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === selectableKeys.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(selectableKeys))
  }

  const selectedRows = rows.filter((r) => selected.has(discoveryRowKey(r)))
  const newCount = selectedRows.filter((r) => !r.already_imported).length
  const updateCount = selectedRows.filter((r) => r.already_imported).length
  const actionLabel = newCount === 0 && updateCount > 0
    ? `Update connectors (${updateCount})`
    : `Import selected (${selectedRows.length})`

  const tenantBody = () => (
    isPersonalAccount ? {} : { organization_id: organizationId }
  )

  const importOne = async (row) => {
    const connectors = (row.connector_ids || []).map(String).filter(Boolean)
    if (!connectors.length) {
      throw new Error(`${row.external_key || row.name}: no connector_id to import with`)
    }

    if (row.already_imported && row.project_id) {
      const missing = connectorsNeedingAttach(row, projects)
      let attachedAny = false
      for (const connectorId of missing) {
        const result = await post(`/api/projects/${encodeURIComponent(row.project_id)}/connectors`, {
          connector_id: connectorId,
          ...tenantBody(),
        })
        if (result?.attached_connector) attachedAny = true
      }
      return { created: false, attached: attachedAny, id: row.project_id }
    }

    // Create with the first connector; subsequent connectors attach via the same
    // import endpoint (idempotent merge by external_id). Omit `id` so the API
    // allocates (short name → owner-prefixed → numeric suffix) without colliding
    // with an unrelated manual project.
    let last = null
    for (let i = 0; i < connectors.length; i += 1) {
      const body = {
        external_id: row.external_id || '',
        external_key: row.external_key || '',
        connector_id: connectors[i],
        name: row.name || '',
        html_url: row.html_url || '',
        default_branch: row.default_branch || '',
        ...tenantBody(),
      }
      last = await post('/api/projects/import', body)
    }
    return {
      created: !!last?.created,
      attached: !!last?.attached_connector,
      id: last?.id,
    }
  }

  const run = async () => {
    if (!selectedRows.length) return
    setBusy(true)
    let created = 0
    let attached = 0
    const failures = []
    try {
      for (const row of selectedRows) {
        try {
          const result = await importOne(row)
          if (result.created) created += 1
          else if (result.attached) attached += 1
        } catch (err) {
          failures.push(`${row.external_key || row.name}: ${err.message || err}`)
        }
      }
      if (failures.length && !created && !attached) {
        toast.push({
          tone: 'danger',
          title: 'Import failed',
          description: failures.slice(0, 3).join(' · '),
        })
      } else if (newCount === 0 && updateCount > 0) {
        toast.push({
          tone: 'success',
          title: 'Connectors updated',
          description: failures.length
            ? `${attached} updated; ${failures.length} failed`
            : undefined,
        })
      } else {
        toast.push({
          tone: failures.length ? 'warning' : 'success',
          title: failures.length ? 'Import finished with errors' : 'Import finished',
          description: [
            created ? `${created} created` : null,
            attached ? `${attached} connector update${attached === 1 ? '' : 's'}` : null,
            failures.length ? `${failures.length} failed` : null,
          ].filter(Boolean).join(' · ') || undefined,
        })
      }
      setSelected(new Set())
      discovery.reload()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  if (!scopeReady) {
    return (
      <Stack>
        <Banner tone="accent" title="Select an organisation">
          Choose an organisation in the top bar to discover repositories across its connectors.
        </Banner>
        <div className="oam-form-actions">
          <Button variant="ghost" onClick={onCancel}>Close</Button>
        </div>
      </Stack>
    )
  }

  const columns = [
    {
      key: 'select',
      header: (
        <Checkbox
          checked={selectableKeys.length > 0 && selected.size === selectableKeys.length}
          indeterminate={selected.size > 0 && selected.size < selectableKeys.length}
          onChange={toggleAll}
          aria-label="Select all actionable repositories"
          disabled={!selectableKeys.length}
        />
      ),
      render: (row) => {
        const key = discoveryRowKey(row)
        const actionable = discoveredRowActionable(row, projects)
        return (
          <Checkbox
            checked={selected.has(key)}
            onChange={() => toggle(key)}
            disabled={!actionable}
            aria-label={`Select ${row.external_key || row.name}`}
          />
        )
      },
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <CellStack
          primary={row.name || '—'}
          secondary={row.private ? 'private' : 'public'}
        />
      ),
    },
    {
      key: 'external_key',
      header: 'Repository',
      render: (row) => (
        row.html_url
          ? (
            <a className="oam-mono" href={row.html_url} target="_blank" rel="noreferrer">
              {row.external_key || '—'}
            </a>
            )
          : <span className="oam-mono">{row.external_key || '—'}</span>
      ),
    },
    {
      key: 'connectors',
      header: 'Connectors',
      render: (row) => <ConnectorChips ids={row.connector_ids} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        if (!row.already_imported) {
          return <Badge tone="accent" dot>available</Badge>
        }
        const missing = connectorsNeedingAttach(row, projects)
        if (missing.length) {
          return (
            <Badge tone="warning" dot title={`Missing: ${missing.join(', ')}`}>
              needs connectors
            </Badge>
          )
        }
        return <Badge tone="good" dot>imported</Badge>
      },
    },
  ]

  return (
    <Stack>
      {note ? <Banner tone="accent" title="Discovery">{note}</Banner> : null}
      {peerErrors.length ? (
        <Banner tone="warning" title="Some connectors failed">
          {peerErrors.map((e) => `${e.connector_id}: ${e.error}`).join(' · ')}
        </Banner>
      ) : null}
      {discovery.error ? (
        <Banner tone="danger" title="Could not discover repositories">
          {discovery.error}
        </Banner>
      ) : null}

      <div className="oam-form-actions">
        <Button
          size="sm"
          variant="ghost"
          icon={<FiRefreshCw />}
          onClick={discovery.reload}
          disabled={discovery.loading}
        >
          Refresh
        </Button>
      </div>

      <Table
        aria-label="Discovered GitHub repositories"
        columns={columns}
        rows={rows}
        state={tableState({ loading: discovery.loading, error: discovery.error, count: rows.length })}
        getRowKey={(row) => discoveryRowKey(row) || row.external_key || row.name}
        emptyState={
          <EmptyState
            icon={<FiGithub />}
            title="No repositories discovered"
            description={
              isPersonalAccount
                ? 'Your personal connectors returned no repos, or none are registered yet. Add a personal GitHub connector under Connectors first.'
                : 'Connectors for this organisation returned no repos, or discovery is empty. Install or claim a GitHub connector under Connectors first.'
            }
          />
        }
        errorState={
          <EmptyState
            icon={<FiGithub />}
            title="Discovery failed"
            description={discovery.error || 'The service did not answer.'}
            actions={<Button size="sm" onClick={discovery.reload}>Retry</Button>}
          />
        }
      />

      <div className="oam-form-actions">
        <Button
          variant="primary"
          loading={busy}
          disabled={!selectedRows.length || busy}
          onClick={run}
        >
          {actionLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Close</Button>
        {selectedRows.length ? (
          <span className="oam-source-detail">
            {[
              newCount ? `${newCount} new` : null,
              updateCount ? `${updateCount} connector update${updateCount === 1 ? '' : 's'}` : null,
            ].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </div>
    </Stack>
  )
}

function ProductAccessCell({ row, code, busy, onToggle }) {
  const enabled = isProductEnabled(row, code)
  return (
    <Checkbox
      checked={enabled}
      disabled={busy}
      onChange={() => onToggle(row, code, !enabled)}
      aria-label={`${PRODUCT_LABELS[code]} access for ${row.id}`}
    />
  )
}

export default function Projects() {
  const toast = useToast()
  const { organizationId, isPersonalAccount, nonce, refresh } = useTenant()
  const [panel, setPanel] = useState(null) // 'new' | 'import' | null
  const [busyKey, setBusyKey] = useState(null)

  const projects = useResource('/api/projects', {
    fallback: { projects: [] },
    deps: [organizationId, nonce],
  })
  const rows = projects.data?.projects || []

  const tenantBody = () => (
    isPersonalAccount ? {} : { organization_id: organizationId === ALL ? undefined : organizationId }
  )

  const remove = async (row) => {
    try {
      await post('/api/projects/delete', { id: row.id, ...tenantBody() })
      toast.push({ tone: 'success', title: `${row.id} removed` })
      projects.reload()
      refresh()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not remove', description: String(err.message || err) })
    }
  }

  const setProducts = async (row, disabledProducts) => {
    const key = `${row.organization_id || ''}/${row.id}`
    setBusyKey(key)
    try {
      await post('/api/projects/products/set', {
        id: row.id,
        disabled_products: disabledProducts,
        ...tenantBody(),
      })
      projects.reload()
    } catch (err) {
      toast.push({
        tone: 'danger',
        title: 'Could not update product access',
        description: String(err.message || err),
      })
    } finally {
      setBusyKey(null)
    }
  }

  const toggleProduct = async (row, code, enabled) => {
    const key = `${row.organization_id || ''}/${row.id}`
    setBusyKey(key)
    try {
      await post('/api/projects/products/set', {
        id: row.id,
        product: code,
        enabled,
        ...tenantBody(),
      })
      projects.reload()
    } catch (err) {
      toast.push({
        tone: 'danger',
        title: 'Could not update product access',
        description: String(err.message || err),
      })
    } finally {
      setBusyKey(null)
    }
  }

  const selectAllForRow = (row) => setProducts(row, [])
  const unselectAllForRow = (row) => setProducts(row, [...PRODUCT_CODES])

  const bulkSetProducts = async (disabledProducts, label) => {
    if (!rows.length) return
    if (rows.length >= 20) {
      const verb = disabledProducts.length ? 'disable all products on' : 'enable all products on'
      if (!window.confirm(`${verb} ${rows.length} projects?`)) return
    }
    setBusyKey('bulk')
    try {
      await post('/api/projects/products/set-bulk', {
        ids: rows.map((r) => r.id),
        disabled_products: disabledProducts,
        ...tenantBody(),
      })
      toast.push({ tone: 'success', title: label })
      projects.reload()
    } catch (err) {
      toast.push({
        tone: 'danger',
        title: 'Could not update product access',
        description: String(err.message || err),
      })
    } finally {
      setBusyKey(null)
    }
  }

  const productColumns = PRODUCT_CODES.map((code) => ({
    key: `product_${code}`,
    header: PRODUCT_LABELS[code],
    render: (row) => (
      <ProductAccessCell
        row={row}
        code={code}
        busy={busyKey === `${row.organization_id || ''}/${row.id}` || busyKey === 'bulk'}
        onToggle={toggleProduct}
      />
    ),
  }))

  const columns = [
    {
      key: 'id',
      header: 'Identifier',
      mono: true,
      render: (row) => (
        <Link className="oam-mono" to={`/projects/${encodeURIComponent(row.id)}`}>
          {row.id}
        </Link>
      ),
    },
    { key: 'name', header: 'Name' },
    {
      key: 'source',
      header: 'Source',
      render: (row) => {
        const source = (row.source || 'manual').toLowerCase()
        return source === 'github'
          ? <Badge tone="accent" dot>github</Badge>
          : <Badge tone="neutral" dot>manual</Badge>
      },
    },
    {
      key: 'external',
      header: 'External',
      render: (row) => {
        const key = row.external_key || ''
        if (!key) return <span className="oam-inherited-value">—</span>
        if (row.html_url) {
          return (
            <a className="oam-mono" href={row.html_url} target="_blank" rel="noreferrer">
              {key}
            </a>
          )
        }
        return <span className="oam-mono">{key}</span>
      },
    },
    {
      key: 'connectors',
      header: 'Connectors',
      render: (row) => <ConnectorChips ids={row.connector_ids} />,
    },
    ...productColumns,
    {
      key: 'row_products',
      header: 'Products',
      render: (row) => {
        const busy = busyKey === `${row.organization_id || ''}/${row.id}` || busyKey === 'bulk'
        return (
          <div className="oam-form-actions">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => selectAllForRow(row)}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => unselectAllForRow(row)}>
              Unselect all
            </Button>
          </div>
        )
      },
    },
    { key: 'updated_at', header: 'Updated', render: (row) => row.updated_at || '—' },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="oam-form-actions">
          <Button size="sm" variant="ghost" href={`/projects/${encodeURIComponent(row.id)}`}>
            Open
          </Button>
          <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => remove(row)}>Remove</Button>
        </div>
      ),
    },
  ]

  return (
    <Stack gap="sections">
      <PageHeader
        title="Projects"
        description={
          'Projects narrow credential and model scope. Import GitHub repositories discovered '
          + 'from your connectors, or create a manual project when there is no repository. '
          + 'Product checkboxes control which family dashboards may use each directory project.'
        }
        meta={[
          { label: 'Organisation', value: organizationId === 'all' ? 'default' : organizationId },
          { label: 'Projects', value: String(rows.length) },
        ]}
        actions={(
          <div className="oam-form-actions">
            <Button
              variant="secondary"
              icon={<FiGithub />}
              onClick={() => setPanel((v) => (v === 'import' ? null : 'import'))}
            >
              Import from GitHub
            </Button>
            <Button
              variant="primary"
              icon={<FiPlus />}
              onClick={() => setPanel((v) => (v === 'new' ? null : 'new'))}
            >
              New project
            </Button>
          </div>
        )}
      />

      {panel === 'new' ? (
        <Card title="New project" quiet>
          <NewProject
            onDone={() => { setPanel(null); projects.reload(); refresh() }}
            onCancel={() => setPanel(null)}
          />
        </Card>
      ) : null}

      {panel === 'import' ? (
        <Card title="Import from GitHub" quiet>
          <ImportFromGitHub
            projects={rows}
            onDone={() => { projects.reload(); refresh() }}
            onCancel={() => setPanel(null)}
          />
        </Card>
      ) : null}

      <Card
        flush
        title="Directory"
        description="Checked = that product may use this project. Empty denylist on the server means all on."
        actions={(
          <div className="oam-form-actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={!rows.length || busyKey === 'bulk'}
              loading={busyKey === 'bulk'}
              onClick={() => bulkSetProducts([], `Enabled all products on ${rows.length} projects`)}
            >
              Select all products
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!rows.length || busyKey === 'bulk'}
              loading={busyKey === 'bulk'}
              onClick={() => bulkSetProducts([...PRODUCT_CODES], `Disabled all products on ${rows.length} projects`)}
            >
              Unselect all products
            </Button>
          </div>
        )}
      >
        <Table
          aria-label="Projects"
          columns={columns}
          rows={rows}
          state={tableState({ loading: projects.loading, error: projects.error, count: rows.length })}
          getRowKey={(row) => `${row.organization_id || ''}/${row.id}`}
          emptyState={
            <EmptyState
              icon={<FiFolder />}
              title="This organisation has no projects"
              description={
                'Nothing is broken without one: credentials and bindings stored with no project apply '
                + 'organisation-wide. Import from GitHub when connectors can see repositories, or add a '
                + 'manual project for OPA/OPL scopes that have no repository.'
              }
              actions={(
                <div className="oam-form-actions">
                  <Button size="sm" variant="secondary" icon={<FiGithub />} onClick={() => setPanel('import')}>
                    Import from GitHub
                  </Button>
                  <Button size="sm" variant="primary" icon={<FiPlus />} onClick={() => setPanel('new')}>
                    New project
                  </Button>
                </div>
              )}
            />
          }
          errorState={
            <EmptyState
              icon={<FiFolder />}
              title="The project list could not be read"
              description={projects.error || 'The service did not answer.'}
              actions={<Button size="sm" onClick={projects.reload}>Retry</Button>}
            />
          }
        />
      </Card>
    </Stack>
  )
}
