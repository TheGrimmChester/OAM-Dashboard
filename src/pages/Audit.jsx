import React, { useState } from 'react'
import {
  PageHeader, Card, Stack, Table, Badge, Button, Field, Input, Banner, EmptyState,
} from '@open-family/ui'
import { FiList } from 'react-icons/fi'
import { useResource, tableState } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'

/**
 * The resolution trail.
 *
 * This page answers the question the per-agent model feature is untestable
 * without: *which model actually ran that job, resolved from whose key*. Each row
 * names the actor, the calling service, the agent key, the scope that won and the
 * model that was handed over — and never the value of any credential, because
 * `writeAudit` refuses to record one.
 *
 * A `fail_closed` outcome is the row an operator is usually looking for: it means
 * a job asked for a credential that no layer supplied, and OAM refused rather
 * than substituting an admin key or an environment default.
 */

const OUTCOME_TONE = {
  ok: 'success',
  fail_closed: 'warning',
  denied: 'danger',
  error: 'danger',
}

const SCOPE_LABEL = {
  user: 'user',
  org: 'organisation',
  admin: 'admin',
}

export default function Audit() {
  const { organizationId, nonce } = useTenant()
  const [product, setProduct] = useState('')
  const [outcome, setOutcome] = useState('')

  const query = new URLSearchParams()
  if (product.trim()) query.set('product', product.trim())
  if (outcome.trim()) query.set('outcome', outcome.trim())
  const suffix = query.toString() ? `?${query}` : ''

  const audit = useResource(`/api/audit${suffix}`, {
    fallback: { events: [] },
    deps: [organizationId, nonce],
  })
  const rows = audit.data?.events || []

  const columns = [
    { key: 'at', header: 'When', render: (row) => row.at || '—' },
    { key: 'action', header: 'Action', mono: true },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div>
          <div className="oam-mono">{row.actor || '(none)'}</div>
          {row.caller && row.caller !== 'user'
            ? <div className="oam-inherited-value">via {row.caller}</div>
            : null}
        </div>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (row) => (row.agent_key
        ? <span className="oam-mono">{row.product ? `${row.product}/` : ''}{row.agent_key}</span>
        : <span className="oam-inherited-value">—</span>),
    },
    {
      key: 'won_scope',
      header: 'Resolved from',
      render: (row) => (row.won_scope
        ? <Badge tone="info" title={`The ${row.won_scope} layer supplied this`}>{SCOPE_LABEL[row.won_scope] || row.won_scope}</Badge>
        : <span className="oam-inherited-value">—</span>),
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => {
        const label = [row.provider, row.model].filter(Boolean).join(' · ')
        return label ? <span className="oam-mono">{label}</span> : <span className="oam-inherited-value">—</span>
      },
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) => (
        <Badge tone={OUTCOME_TONE[row.outcome] || 'neutral'} dot title={row.detail || row.outcome}>
          {row.outcome || 'unknown'}
        </Badge>
      ),
    },
    {
      key: 'logical_key',
      header: 'Key',
      render: (row) => (row.logical_key
        ? <span className="oam-mono">{row.logical_key}</span>
        : <span className="oam-inherited-value">—</span>),
    },
  ]

  return (
    <Stack gap="sections">
      <PageHeader
        title="Audit"
        description={
          'Every credential resolution and configuration change, newest first. Credential values are never '
          + 'recorded — the columns say which scope won and which model was handed to the job, which is what '
          + 'makes “why did this job use that model” answerable after the fact.'
        }
        meta={[
          { label: 'Organisation', value: organizationId === 'all' ? 'default' : organizationId },
          { label: 'Events shown', value: String(rows.length) },
          { label: 'Retention', value: '365 days' },
        ]}
      />

      <Card title="Filter">
        <div className="oam-binding-editor">
          <Field label="Product" hint="opm, ora, osa, opl, oam">
            <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="(all)" />
          </Field>
          <Field label="Outcome" hint="ok, fail_closed, denied, error">
            <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="(all)" />
          </Field>
        </div>
        <div className="oam-form-actions">
          <Button variant="primary" onClick={audit.reload}>Apply</Button>
          <Button
            variant="ghost"
            onClick={() => { setProduct(''); setOutcome('') }}
          >
            Clear
          </Button>
          <Button
            variant="ghost"
            onClick={() => { setProduct(''); setOutcome('fail_closed') }}
            title="Jobs that were refused a credential rather than given a fallback"
          >
            Show fail-closed only
          </Button>
        </div>
      </Card>

      {audit.error ? (
        <Banner
          tone="danger"
          title="Could not read the audit log"
          actions={<Button size="sm" onClick={audit.reload}>Retry</Button>}
        >
          {audit.error}
        </Banner>
      ) : null}

      <Card flush>
        <Table
          aria-label="Audit events"
          compact
          columns={columns}
          rows={rows}
          state={tableState({ loading: audit.loading, error: audit.error, count: rows.length })}
          getRowKey={(row, i) => `${row.at}/${row.action}/${i}`}
          emptyState={
            <EmptyState
              icon={<FiList />}
              title="No audit events match"
              description={
                'Either nothing has resolved a credential in this organisation yet, or the filters exclude '
                + 'everything. This is not a claim that nothing happened elsewhere — the view is scoped to '
                + 'your organisation, and to your own actions unless you are an admin.'
              }
            />
          }
          errorState={
            <EmptyState
              icon={<FiList />}
              title="The audit log could not be read"
              description={audit.error || 'The service did not answer.'}
              actions={<Button size="sm" onClick={audit.reload}>Retry</Button>}
            />
          }
        />
      </Card>
    </Stack>
  )
}
