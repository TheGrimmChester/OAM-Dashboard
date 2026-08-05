import React, { useState } from 'react'
import {
  PageHeader, Card, Stack, Table, Badge, Button, Field, Input, Select, Banner,
  EmptyState, useToast,
} from '@open-family/ui'
import { FiKey, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useResource, post, tableState } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'

/**
 * Credentials: which keys exist, at which scope, and nothing else.
 *
 * The list endpoint returns `has_value` and never a value — that is a property of
 * the service, not of this page (secrets leave OAM only through the service-JWT
 * resolve endpoint a job calls). The page is written to match: there is no reveal
 * control, no "copy" button and no state that ever holds a fetched secret,
 * because the honest UI for a store that cannot read back its own values is one
 * that does not pretend it could.
 *
 * A value is therefore write-only from here: you can replace it, you cannot see
 * it. That is stated on the page rather than left to be discovered.
 */

const SCOPES = [
  { value: 'org', label: 'Organisation — everyone in this org' },
  { value: 'user', label: 'Just me — a personal override' },
  { value: 'admin', label: 'Admin — never served to a tenant caller' },
]

const SCOPE_TONE = { admin: 'warning', org: 'info', user: 'success' }

/**
 * Known logical keys, offered as suggestions rather than enforced.
 *
 * The list is a convenience: OAM validates the *shape* of a value per key on
 * write (that is what rejected a Docker error string once stored as a Cursor
 * key), so a typo'd key name would store a value nothing ever resolves. Free
 * text stays allowed because products add keys without this console changing.
 */
const KNOWN_KEYS = [
  'cursor_api_key',
  'openai_api_key',
  'anthropic_api_key',
  'github_pat',
]

function SetCredential({ onDone, onCancel }) {
  const toast = useToast()
  const { scopeLabel } = useTenant()
  const [key, setKey] = useState('')
  const [scope, setScope] = useState('org')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/api/credentials/set', { key: key.trim(), scope, value })
      // The value is cleared immediately on success. Leaving a secret in a React
      // state tree after it has been stored buys nothing and keeps it in a heap
      // snapshot for as long as the page lives.
      setValue('')
      toast.push({ tone: 'success', title: `${key.trim()} stored at ${scope} scope` })
      onDone()
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack>
      {error ? (
        <Banner tone="danger" title="The value was not stored">
          {error}
        </Banner>
      ) : null}
      <Banner tone="warning" title="Write-only">
        Stored values are never returned by the API. Saving replaces the current value for this key and
        scope; there is no way to read the old one back from here.
      </Banner>
      <div className="oam-binding-editor">
        <Field label="Key" hint="The logical name a job resolves. Free text — products add their own.">
          <Input
            list="oam-known-keys"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="cursor_api_key"
          />
          <datalist id="oam-known-keys">
            {KNOWN_KEYS.map((k) => <option key={k} value={k} />)}
          </datalist>
        </Field>
        <Field label="Scope" hint={`Organisation writes land on ${scopeLabel}.`}>
          <Select block options={SCOPES} value={scope} onChange={(e) => setScope(e.target.value)} />
        </Field>
        <Field
          label="Value"
          hint="Validated on write: error text, embedded newlines and oversized values are rejected."
        >
          <Input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="paste the secret"
          />
        </Field>
      </div>
      <div className="oam-form-actions">
        <Button variant="primary" loading={busy} disabled={!key.trim() || !value} onClick={save}>
          Store value
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Stack>
  )
}

export default function Credentials() {
  const toast = useToast()
  const { organizationId, projectId, nonce } = useTenant()
  const [adding, setAdding] = useState(false)

  const creds = useResource('/api/credentials', {
    fallback: { credentials: [] },
    deps: [organizationId, projectId, nonce],
  })
  const rows = creds.data?.credentials || []

  const remove = async (row) => {
    try {
      await post('/api/credentials/delete', { key: row.key, scope: row.scope, user_id: row.user_id })
      toast.push({ tone: 'success', title: `${row.key} removed at ${row.scope} scope` })
      creds.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not remove', description: String(err.message || err) })
    }
  }

  const columns = [
    { key: 'key', header: 'Key', mono: true },
    {
      key: 'scope',
      header: 'Scope',
      render: (row) => (
        <Badge tone={SCOPE_TONE[row.scope] || 'neutral'} dot title={`Resolved for ${row.scope} callers`}>
          {row.scope}
        </Badge>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) => (row.user_id
        ? <span className="oam-mono">{row.user_id}</span>
        : <span className="oam-inherited-value">— whole scope —</span>),
    },
    {
      key: 'organization_id',
      header: 'Organisation',
      render: (row) => <span className="oam-mono">{row.organization_id || '(org-wide)'}</span>,
    },
    {
      key: 'has_value',
      header: 'Value',
      render: (row) => (row.has_value
        ? <Badge tone="success" dot title="A decryptable value is stored">stored</Badge>
        // A row with no decryptable value is worse than a missing row: jobs will
        // fail closed against it while the list suggests the key is configured.
        : <Badge tone="danger" dot title="The row exists but holds nothing decryptable">empty</Badge>),
    },
    { key: 'updated_at', header: 'Updated', render: (row) => row.updated_at || '—' },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => remove(row)}>
          Remove
        </Button>
      ),
    },
  ]

  return (
    <Stack gap="sections">
      <PageHeader
        title="Credentials"
        description={
          'AI provider keys and connector secrets, scoped admin / organisation / user. A job resolves '
          + 'user → organisation and fails closed if neither has the key it needs — it never falls back to '
          + 'an admin-scoped value.'
        }
        meta={[
          { label: 'Organisation', value: organizationId === 'all' ? 'default' : organizationId },
          { label: 'Keys visible', value: String(rows.length) },
        ]}
        actions={
          <Button variant="primary" icon={<FiPlus />} onClick={() => setAdding((v) => !v)}>
            Set a value
          </Button>
        }
      />

      {creds.error ? (
        <Banner
          tone="danger"
          title="Could not read the credential list"
          actions={<Button size="sm" onClick={creds.reload}>Retry</Button>}
        >
          {creds.error}
        </Banner>
      ) : null}

      {adding ? (
        <Card title="Store a credential" quiet>
          <SetCredential
            onDone={() => { setAdding(false); creds.reload() }}
            onCancel={() => setAdding(false)}
          />
        </Card>
      ) : null}

      <Card flush>
        <Table
          aria-label="Credentials"
          columns={columns}
          rows={rows}
          state={tableState({ loading: creds.loading, error: creds.error, count: rows.length })}
          getRowKey={(row, i) => `${row.key}/${row.scope}/${row.user_id || ''}/${i}`}
          emptyState={
            <EmptyState
              icon={<FiKey />}
              title="No credentials are visible at this scope"
              description={
                'Either none are stored for this organisation, or they are held at a scope you cannot see — '
                + 'a personal override belongs to its owner and an admin-scoped key is not listed to tenant '
                + 'callers. Storing one here makes it resolvable by every job in the scope you choose.'
              }
            />
          }
          errorState={
            <EmptyState
              icon={<FiKey />}
              title="The credential list could not be read"
              description={creds.error || 'The service did not answer.'}
              actions={<Button size="sm" onClick={creds.reload}>Retry</Button>}
            />
          }
        />
      </Card>
    </Stack>
  )
}
