import React, { useState } from 'react'
import {
  PageHeader, Card, Stack, Table, CellStack, Badge, Button, Field, Input, Select,
  Banner, EmptyState, Checkbox, useToast,
} from '@open-family/ui'
import { FiServer, FiPlus, FiTrash2, FiArrowUp, FiArrowDown, FiEdit2 } from 'react-icons/fi'
import { useResource, post, tableState } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'
import { endpointScopeOptions, readAccountType } from '../utils/accountType'

/**
 * The AI endpoint registry: which providers an organisation can reach, in the
 * order a job tries them.
 *
 * This is the page that made several accounts of one kind possible. Before it,
 * each provider mapped to exactly one credential per scope, so an organisation
 * could hold one Cursor account, one OpenAI key and one Anthropic key — and a 429
 * on that one endpoint failed the job.
 *
 * Order is the feature, so it is the primary interaction: the table is the
 * failover order, top to bottom, and the arrows move an endpoint through it. The
 * reorder call sends the whole list rather than one endpoint's new number, because
 * a client that PATCHed a single priority would have to renumber the rest itself,
 * and two people reordering at once would interleave into an order neither chose.
 */

const KIND_TONE = {
  api_openai: 'info',
  api_anthropic: 'accent',
  cli_cursor: 'success',
  cli_claude_code: 'accent',
  cli_qwen_code: 'warning',
  cli_generic: 'neutral',
}


function EndpointForm({ kinds, existing, onDone, onCancel }) {
  const toast = useToast()
  const { scopeLabel } = useTenant()
  const accountType = readAccountType()
  const scopeOptions = endpointScopeOptions(accountType)
  const editing = !!existing
  const [id, setId] = useState(existing?.id || '')
  const [label, setLabel] = useState(existing?.label || '')
  const [kind, setKind] = useState(existing?.kind || kinds[0]?.kind || 'api_openai')
  const [scope, setScope] = useState(existing?.scope || scopeOptions[0]?.value || 'user')
  const [baseUrl, setBaseUrl] = useState(existing?.base_url || '')
  const [models, setModels] = useState((existing?.models || []).join(', '))
  const [cliCommand, setCliCommand] = useState(existing?.cli_command || '')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const info = kinds.find((k) => k.kind === kind) || {}
  const isHTTP = info.transport === 'http'
  const idError = id && !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(id)
    ? 'Lower-case letters, digits, hyphen and underscore; must start with a letter or digit.'
    : null

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = {
        id: id.trim(),
        label,
        kind,
        scope,
        base_url: baseUrl,
        cli_command: cliCommand,
        models: models.split(',').map((s) => s.trim()).filter(Boolean),
      }
      // Only send the value when one was typed. An empty string would be rejected
      // by the shape check, and on an edit it must not clear the stored key.
      if (value.trim()) body.value = value
      const r = await post('/api/ai/endpoints/set', body)
      setValue('')
      toast.push({
        tone: 'success',
        title: `${id.trim()} saved`,
        description: r?.credential_stored ? 'Credential stored.' : undefined,
      })
      onDone()
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack>
      {error ? <Banner tone="danger" title="Could not save this endpoint">{error}</Banner> : null}
      {scope === 'org' ? (
        <Banner tone="accent" title={`This endpoint will belong to ${scopeLabel}`}>
          Switch organisations in the top bar before saving if that is not what you want.
        </Banner>
      ) : null}
      <div className="oam-binding-editor">
        <Field
          label="Identifier"
          hint="Names this endpoint's credential too, so it cannot collide with another."
          error={idError}
        >
          <Input
            value={id}
            onChange={(e) => setId(e.target.value)}
            invalid={!!idError}
            disabled={editing}
            placeholder="cursor-personal"
          />
        </Field>
        <Field label="Display name">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cursor (personal)" />
        </Field>
        <Field label="Kind" hint={info.transport === 'cli' ? 'Runs a binary in the job container.' : 'Called over HTTP.'}>
          <Select
            block
            options={kinds.map((k) => ({ value: k.kind, label: k.label }))}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          />
        </Field>
        <Field label="Scope">
          <Select block options={scopeOptions} value={scope} onChange={(e) => setScope(e.target.value)} disabled={editing} />
        </Field>
        {isHTTP ? (
          <Field
            label="Base URL"
            hint={info.default_base_url ? `Blank uses ${info.default_base_url}` : 'Required.'}
          >
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={info.default_base_url || 'https://…'}
            />
          </Field>
        ) : null}
        {info.needs_command ? (
          <Field label="Command" hint="The binary to run. Must exist in the runner image.">
            <Input value={cliCommand} onChange={(e) => setCliCommand(e.target.value)} placeholder="my-agent" />
          </Field>
        ) : null}
        <Field
          label="Models"
          hint="Comma-separated allowlist. Leave empty to accept any model — that is the usual choice."
        >
          <Input value={models} onChange={(e) => setModels(e.target.value)} placeholder="(any)" />
        </Field>
        <Field
          label={editing ? 'Replace credential' : 'Credential'}
          hint={editing
            ? 'Leave blank to keep the stored value. It is never shown.'
            : 'Stored encrypted and never returned. Validated on write.'}
        >
          <Input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={editing ? '(unchanged)' : 'paste the key'}
          />
        </Field>
      </div>
      <div className="oam-form-actions">
        <Button variant="primary" loading={busy} disabled={!id.trim() || !!idError} onClick={save}>
          {editing ? 'Save changes' : 'Register endpoint'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Stack>
  )
}

export default function Endpoints() {
  const toast = useToast()
  const { organizationId, projectId, nonce } = useTenant()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  const kindsRes = useResource('/api/ai/endpoints/kinds', { fallback: { kinds: [] } })
  const kinds = kindsRes.data?.kinds || []

  const eps = useResource('/api/ai/endpoints', {
    fallback: { endpoints: [] },
    deps: [organizationId, projectId, nonce],
  })
  const rows = eps.data?.endpoints || []

  const move = async (row, delta) => {
    const order = rows.map((r) => r.id)
    const i = order.indexOf(row.id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= order.length) return
    // Swap locally and send the whole resulting order, so the server is never
    // asked to infer what the rest should become.
    ;[order[i], order[j]] = [order[j], order[i]]
    try {
      const r = await post('/api/ai/endpoints/reorder', { order })
      if (r?.skipped) {
        toast.push({
          tone: 'warning',
          title: 'Order partly applied',
          description: `${r.skipped} endpoint(s) were skipped — they may have been deleted or belong to another scope.`,
        })
      }
      eps.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not reorder', description: String(err.message || err) })
    }
  }

  const toggle = async (row) => {
    try {
      await post('/api/ai/endpoints/set', { id: row.id, kind: row.kind, scope: row.scope, enabled: !row.enabled })
      eps.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not update', description: String(err.message || err) })
    }
  }

  const remove = async (row) => {
    try {
      const r = await post('/api/ai/endpoints/delete', { id: row.id, scope: row.scope })
      toast.push({
        tone: 'success',
        title: `${row.id} removed`,
        // Worth saying: removing an endpoint is a routing change, and destroying
        // the key is not recoverable, so the two are deliberately separate.
        description: r?.note || undefined,
      })
      eps.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not remove', description: String(err.message || err) })
    }
  }

  const columns = [
    {
      key: 'order',
      header: 'Try',
      render: (row) => {
        const i = rows.indexOf(row)
        return (
          <div className="oam-form-actions">
            <span className="oam-mono">{i + 1}</span>
            <Button
              size="sm" variant="ghost" aria-label={`Move ${row.id} earlier`}
              icon={<FiArrowUp />} disabled={i === 0} onClick={() => move(row, -1)}
            />
            <Button
              size="sm" variant="ghost" aria-label={`Move ${row.id} later`}
              icon={<FiArrowDown />} disabled={i === rows.length - 1} onClick={() => move(row, 1)}
            />
          </div>
        )
      },
    },
    {
      key: 'label',
      header: 'Endpoint',
      render: (row) => (
        <CellStack
          primary={(
            <>
              {row.label || row.id}
              {row.scope === 'user' ? (
                <> <Badge tone="success" title="Your own account — tried before the organisation's">mine</Badge></>
              ) : null}
            </>
          )}
          secondary={<span className="oam-mono">{row.id}</span>}
        />
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) => (
        <Badge tone={KIND_TONE[row.kind] || 'neutral'} title={row.kind}>
          {row.kind_label || row.kind}
        </Badge>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) => (
        <CellStack
          primary={row.effective_base_url
            ? <span className="oam-mono">{row.effective_base_url}</span>
            : <span className="oam-inherited-value">{row.cli_command || 'CLI in the runner image'}</span>}
          secondary={row.models?.length
            ? <span className="oam-mono">models: {row.models.join(', ')}</span>
            : <span className="oam-inherited-value">any model</span>}
        />
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <CellStack
          /* Three distinct states, because they call for three different actions:
             ready, deliberately off, and configured-but-unusable. A job silently
             skips the third, so it must not look like the first. */
          primary={!row.enabled
            ? <Badge tone="neutral" dot title="Disabled — jobs skip it, the credential is kept">disabled</Badge>
            : !row.has_credential
              ? <Badge tone="danger" dot title="No credential — jobs skip this endpoint entirely">no credential</Badge>
              : <Badge tone="success" dot title={`Credential resolved at ${row.credential_scope} scope`}>ready</Badge>}
          secondary={(
            <Checkbox
              checked={row.enabled}
              onChange={() => toggle(row)}
              label={row.enabled ? 'enabled' : 'off'}
              aria-label={`${row.enabled ? 'Disable' : 'Enable'} ${row.id}`}
            />
          )}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="oam-form-actions">
          <Button
            size="sm" variant="ghost" aria-label={`Edit ${row.id}`}
            icon={<FiEdit2 />} onClick={() => setEditing(row.id)}
          />
          <Button
            size="sm" variant="ghost" aria-label={`Remove ${row.id}`}
            icon={<FiTrash2 />} onClick={() => remove(row)}
          />
        </div>
      ),
    },
  ]

  const editRow = rows.find((r) => r.id === editing)
  const ready = rows.filter((r) => r.enabled && r.has_credential).length

  return (
    <Stack gap="sections">
      <PageHeader
        title="AI Endpoints"
        description={
          'Every API and agent account this organisation can reach, in the order a job tries them. When one is '
          + 'down or over quota the job falls through to the next, so the order is the failover policy.'
        }
        meta={[
          { label: 'Organisation', value: organizationId === 'all' ? 'default' : organizationId },
          { label: 'Registered', value: String(rows.length) },
          { label: 'Usable now', value: String(ready) },
        ]}
        actions={
          <Button variant="primary" icon={<FiPlus />} onClick={() => { setAdding((v) => !v); setEditing(null) }}>
            Register endpoint
          </Button>
        }
      />

      {eps.error ? (
        <Banner
          tone="danger"
          title="Could not read the endpoint list"
          actions={<Button size="sm" onClick={eps.reload}>Retry</Button>}
        >
          {eps.error}
        </Banner>
      ) : null}

      {rows.length && !ready ? (
        <Banner tone="danger" title="No endpoint is usable">
          Every registered endpoint is disabled or missing its credential, so jobs will fail closed with
          <code> credential_unavailable</code> rather than falling back to a deployment-wide key.
        </Banner>
      ) : null}

      {adding ? (
        <Card title="Register an endpoint" quiet>
          <EndpointForm
            kinds={kinds}
            onDone={() => { setAdding(false); eps.reload() }}
            onCancel={() => setAdding(false)}
          />
        </Card>
      ) : null}

      {editRow ? (
        <Card title={`Edit ${editRow.label || editRow.id}`} quiet>
          <EndpointForm
            kinds={kinds}
            existing={editRow}
            onDone={() => { setEditing(null); eps.reload() }}
            onCancel={() => setEditing(null)}
          />
        </Card>
      ) : null}

      <Card flush>
        <Table
          aria-label="AI endpoints in failover order"
          columns={columns}
          rows={rows}
          state={tableState({ loading: eps.loading, error: eps.error, count: rows.length })}
          getRowKey={(row) => `${row.scope}/${row.id}`}
          emptyState={
            <EmptyState
              icon={<FiServer />}
              title="No endpoints are registered"
              description={
                'Jobs will fall back to the deployment-wide provider key, which is the pre-registry behaviour — '
                + 'one account per provider, and no failover. Register endpoints here to hold several accounts of '
                + 'the same kind and give them a failover order.'
              }
              actions={<Button variant="primary" onClick={() => setAdding(true)}>Register the first endpoint</Button>}
            />
          }
          errorState={
            <EmptyState
              icon={<FiServer />}
              title="The endpoint list could not be read"
              description={eps.error || 'The service did not answer.'}
              actions={<Button size="sm" onClick={eps.reload}>Retry</Button>}
            />
          }
        />
      </Card>

      <Card title="How a job picks one">
        <p className="oam-source-detail">
          Your own endpoints are tried before the organisation&apos;s, regardless of their numbers — a personal
          account is an override of the shared one. Within each of those, the order above applies. An endpoint
          with no credential is skipped entirely rather than attempted, and if nothing is left the job fails
          closed instead of borrowing a deployment-wide key. A job receives at most the first few endpoints
          (three by default) so that a single job never holds more credentials than it needs.
        </p>
      </Card>
    </Stack>
  )
}
