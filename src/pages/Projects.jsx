import React, { useState } from 'react'
import {
  PageHeader, Card, Stack, Table, Button, Field, Input, Banner, EmptyState, useToast,
} from '@open-family/ui'
import { FiFolder, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useResource, post, tableState } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/

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
      // The organisation is not a field: it comes from the scope headers the
      // switcher sets, so the row cannot land somewhere other than the scope the
      // top bar is showing.
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
        Switch organisations in the top bar before creating it if that is not what you want.
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

export default function Projects() {
  const toast = useToast()
  const { organizationId, nonce, refresh } = useTenant()
  const [adding, setAdding] = useState(false)

  const projects = useResource('/api/projects', {
    fallback: { projects: [] },
    deps: [organizationId, nonce],
  })
  const rows = projects.data?.projects || []

  const remove = async (row) => {
    try {
      await post('/api/projects/delete', { id: row.id })
      toast.push({ tone: 'success', title: `${row.id} removed` })
      projects.reload()
      refresh()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not remove', description: String(err.message || err) })
    }
  }

  const columns = [
    { key: 'id', header: 'Identifier', mono: true },
    { key: 'name', header: 'Name' },
    {
      key: 'organization_id',
      header: 'Organisation',
      render: (row) => <span className="oam-mono">{row.organization_id || '(org-wide)'}</span>,
    },
    { key: 'updated_at', header: 'Updated', render: (row) => row.updated_at || '—' },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => remove(row)}>Remove</Button>
      ),
    },
  ]

  return (
    <Stack gap="sections">
      <PageHeader
        title="Projects"
        description={
          'Projects narrow a scope inside an organisation. A credential or binding stored without a project '
          + 'applies to every project in the organisation, which is how an organisation-wide default works.'
        }
        meta={[
          { label: 'Organisation', value: organizationId === 'all' ? 'default' : organizationId },
          { label: 'Projects', value: String(rows.length) },
        ]}
        actions={
          <Button variant="primary" icon={<FiPlus />} onClick={() => setAdding((v) => !v)}>
            New project
          </Button>
        }
      />

      {adding ? (
        <Card title="New project" quiet>
          <NewProject onDone={() => { setAdding(false); projects.reload(); refresh() }} onCancel={() => setAdding(false)} />
        </Card>
      ) : null}

      <Card flush>
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
                + 'organisation-wide. Add projects when different repositories need different keys or models.'
              }
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
