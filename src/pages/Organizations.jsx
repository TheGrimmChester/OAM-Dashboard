import React, { useState } from 'react'
import {
  PageHeader, Card, Stack, Table, Button, Field, Input, Banner, EmptyState, useToast,
} from '@open-family/ui'
import { FiHome, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useResource, post, tableState } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'

/**
 * The authoritative organisation directory.
 *
 * Before OAM the family's org list came from the hub's in-memory agent registry,
 * which only knew organisations that telemetry had arrived under and lost them on
 * restart — so an organisation created here but not yet sending data did not
 * exist as far as any product's picker was concerned. Rows created on this page
 * are stored, and the hub serves them with `source: "oam"`.
 */

// Mirrors OAM's own `idPattern`. Validating client-side is a courtesy — the
// service rejects a bad id regardless — but it turns a 400 into an inline hint.
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/

function NewOrganization({ onDone, onCancel }) {
  const toast = useToast()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const idError = id && !ID_PATTERN.test(id)
    ? 'Lower-case letters, digits, hyphen and underscore; must start with a letter or digit.'
    : null

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/api/organizations/set', { id: id.trim(), name, description })
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
      <div className="oam-binding-editor">
        <Field label="Identifier" hint="Used in tenant headers and on every scoped row." error={idError}>
          <Input value={id} onChange={(e) => setId(e.target.value)} invalid={!!idError} placeholder="acme" />
        </Field>
        <Field label="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <div className="oam-form-actions">
        <Button variant="primary" loading={busy} disabled={!id.trim() || !!idError} onClick={save}>
          Create organisation
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Stack>
  )
}

export default function Organizations() {
  const toast = useToast()
  const { nonce, refresh } = useTenant()
  const [adding, setAdding] = useState(false)

  const orgs = useResource('/api/organizations', { fallback: { organizations: [] }, deps: [nonce] })
  const rows = orgs.data?.organizations || []

  const remove = async (row) => {
    try {
      await post('/api/organizations/delete', { id: row.id })
      toast.push({ tone: 'success', title: `${row.id} removed` })
      orgs.reload()
      // The switcher reads the same list, so it must not keep offering a
      // deleted organisation as a write target.
      refresh()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not remove', description: String(err.message || err) })
    }
  }

  const columns = [
    { key: 'id', header: 'Identifier', mono: true },
    { key: 'name', header: 'Name' },
    { key: 'description', header: 'Description', render: (row) => row.description || '—' },
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
        title="Organisations"
        description={
          'The family directory. Every product reads this list — the hub serves it to OPM and OSA — and every '
          + 'credential, project and model binding is scoped to one of these.'
        }
        meta={[{ label: 'Organisations', value: String(rows.length) }]}
        actions={
          <Button variant="primary" icon={<FiPlus />} onClick={() => setAdding((v) => !v)}>
            New organisation
          </Button>
        }
      />

      {adding ? (
        <Card title="New organisation" quiet>
          <NewOrganization onDone={() => { setAdding(false); orgs.reload(); refresh() }} onCancel={() => setAdding(false)} />
        </Card>
      ) : null}

      <Card flush>
        <Table
          aria-label="Organisations"
          columns={columns}
          rows={rows}
          state={tableState({ loading: orgs.loading, error: orgs.error, count: rows.length })}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              icon={<FiHome />}
              title="No organisations are stored yet"
              description={
                'Products will fall back to their default organisation until one exists here. Creating one '
                + 'makes it selectable in every family console immediately, with no agent enrolled.'
              }
            />
          }
          errorState={
            <EmptyState
              icon={<FiHome />}
              title="The directory could not be read"
              description={orgs.error || 'The service did not answer.'}
              actions={<Button size="sm" onClick={orgs.reload}>Retry</Button>}
            />
          }
        />
      </Card>
    </Stack>
  )
}
