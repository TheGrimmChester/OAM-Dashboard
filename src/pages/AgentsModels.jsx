import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  PageHeader, Card, Stack, Table, Badge, Button, Field, Input, Select, Banner,
  EmptyState, Segmented, useToast,
} from '@open-family/ui'
import { FiCpu, FiEdit2, FiRotateCcw } from 'react-icons/fi'
import { useResource, post, tableState, describeError } from '../hooks/useApi'
import { apiUrl } from '../utils/apiBase'
import { useTenant } from '../contexts/TenantContext'
import ProjectWriteBanner from '../components/ProjectWriteBanner'
import { isPersonalAccount, readAccountType, userScopeLabel } from '../utils/accountType'
import { buildAgentRow, groupByProduct, summarizeBinding } from '../utils/inheritance'

/**
 * Where "light model to plan, strong model to implement" is configured.
 *
 * The page is built on two OAM endpoints that answer different questions:
 *
 *   GET /api/agents/catalog   — which agents exist. Products publish this on
 *                               boot, so adding an OPM job kind needs no change
 *                               here. It is the row set.
 *   GET /api/models/effective — what would actually run for one agent, and which
 *                               layer supplied it. It is the value, and the
 *                               inherited-value indicator.
 *
 * Rendering only stored bindings would be the obvious shortcut and the wrong
 * one: an agent with no binding is exactly the agent someone came here to
 * configure, and it would be missing from the table.
 */

const PROVIDERS = [
  { value: 'cli_cursor', label: 'Cursor CLI (cli_cursor)' },
  { value: 'cli_qwen_code', label: 'Qwen Code CLI' },
  { value: 'openai', label: 'OpenAI-compatible (openai)' },
  { value: 'anthropic', label: 'Anthropic (anthropic)' },
]

const TIER_TONE = { light: 'info', strong: 'warning' }

function SourceBadge({ row }) {
  if (row.unresolved) {
    return (
      <Badge tone="danger" dot title="No provider or model resolved at any layer">
        Not resolved
      </Badge>
    )
  }
  return (
    <Badge tone={row.sourceTone === 'accent' ? 'success' : row.sourceTone} dot title={row.sourceDetail}>
      {row.sourceLabel}
    </Badge>
  )
}

/**
 * The editor for one agent's binding.
 *
 * `scope` is deliberately explicit rather than inferred from the user's role: an
 * admin can set both an organisation binding and a personal one for themselves,
 * and those are different acts with different blast radius. The service enforces
 * the same distinction — a user may write their own scope without being an
 * admin — so the control mirrors the authorisation rather than guessing at it.
 */
function BindingEditor({ product, agentKey, scope, current, onDone, onCancel }) {
  const toast = useToast()
  const [provider, setProvider] = useState(current.provider || 'cli_cursor')
  const [model, setModel] = useState(current.model || 'auto')
  const [baseUrl, setBaseUrl] = useState(current.baseUrl || '')
  const [fallback, setFallback] = useState(current.fallbackModel || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/api/models/bindings/set', {
        product,
        agent_key: agentKey,
        scope,
        provider,
        model,
        base_url: baseUrl,
        fallback_model: fallback,
      })
      toast.push({ tone: 'success', title: `${agentKey} → ${model || provider}` })
      onDone()
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack>
      {error ? <Banner tone="danger" title="Could not save this binding">{error}</Banner> : null}
      <div className="oam-binding-editor">
        <Field label="Provider" hint="Which runtime executes the agent.">
          <Select
            block
            options={PROVIDERS}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </Field>
        <Field
          label="Model"
          hint={provider === 'cli_qwen_code'
            ? 'Qwen Code does not support `auto` — enter an explicit model id (e.g. qwen3-coder-plus).'
            : '`auto` lets the provider choose — a real setting here, not a placeholder.'}
        >
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="auto" />
        </Field>
        <Field label="Base URL" hint="Optional. For an OpenAI-compatible endpoint.">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="(provider default)" />
        </Field>
        <Field label="Fallback model" hint="Optional. Used when the primary model is unavailable.">
          <Input value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="(none)" />
        </Field>
      </div>
      <div className="oam-form-actions">
        <Button variant="primary" loading={busy} onClick={save}>
          {scope === 'user' ? 'Save my override' : 'Save for the organisation'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Stack>
  )
}

export default function AgentsModels() {
  const toast = useToast()
  const {
    organizationId, nonce, scopeKey, isPersonalAccount: personal,
    hasConcreteProject, selectionIsMulti,
  } = useTenant()
  const [scope, setScope] = useState(() => (isPersonalAccount(readAccountType()) ? 'user' : 'org'))
  const [editing, setEditing] = useState(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const userLabel = userScopeLabel(readAccountType())

  const catalog = useResource('/api/agents/catalog', {
    fallback: { agents: [] },
    deps: [scopeKey, nonce, reloadNonce],
  })
  const agents = catalog.data?.agents || []

  // One effective-binding lookup per agent. The catalog is small — a handful of
  // keys per product — and asking the service "what would run" is the only
  // honest way to fill the column: re-deriving the precedence order client-side
  // would be a second implementation of it, free to disagree with the one that
  // actually runs jobs.
  const [effective, setEffective] = useState({})
  const [effectiveError, setEffectiveError] = useState(null)
  const [effectiveLoading, setEffectiveLoading] = useState(false)

  useEffect(() => {
    if (!agents.length) {
      setEffective({})
      return undefined
    }
    let active = true
    setEffectiveLoading(true)
    setEffectiveError(null)
    Promise.all(agents.map((a) => axios
      .get(apiUrl(`/api/models/effective?product=${encodeURIComponent(a.product)}&agent_key=${encodeURIComponent(a.agent_key)}`))
      .then((r) => [`${a.product}/${a.agent_key}`, r.data?.effective || null])
      .catch((err) => [`${a.product}/${a.agent_key}`, { __error: describeError(err) }])))
      .then((pairs) => {
        if (!active) return
        setEffective(Object.fromEntries(pairs))
        const failed = pairs.filter(([, v]) => v && v.__error)
        // Partial failure is reported rather than swallowed: a row whose lookup
        // failed must not render as "family default".
        if (failed.length) {
          setEffectiveError(`${failed.length} of ${pairs.length} lookups failed: ${failed[0][1].__error}`)
        }
      })
      .finally(() => { if (active) setEffectiveLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(agents.map((a) => `${a.product}/${a.agent_key}`)), scopeKey, reloadNonce])

  const groups = useMemo(() => {
    const rows = agents.map((a) => {
      const eff = effective[`${a.product}/${a.agent_key}`]
      return buildAgentRow(a, eff && !eff.__error ? eff : null, scope)
    })
    return groupByProduct(rows)
  }, [agents, effective, scope])

  const resetBinding = async (row) => {
    try {
      await post('/api/models/bindings/delete', {
        product: row.product,
        agent_key: row.agentKey,
        scope,
      })
      toast.push({ tone: 'success', title: `${row.agentKey} now inherits again` })
      setReloadNonce((n) => n + 1)
    } catch (err) {
      toast.push({ tone: 'danger', title: 'Could not reset', description: String(err.message || err) })
    }
  }

  const columns = [
    {
      key: 'label',
      header: 'Agent',
      render: (row) => (
        <div>
          <div>{row.label}</div>
          <div className="oam-mono">{row.agentKey}</div>
        </div>
      ),
    },
    {
      key: 'tier',
      header: 'Suggested tier',
      render: (row) => (row.tierHint
        ? <Badge tone={TIER_TONE[row.tierHint] || 'neutral'} title={`The product suggests a ${row.tierHint} model for this agent`}>{row.tierHint}</Badge>
        : <span className="oam-inherited-value">—</span>),
    },
    {
      key: 'effective',
      header: 'Effective model',
      render: (row) => (
        <span className={row.inherited ? 'oam-inherited-value' : undefined}>
          {summarizeBinding(row)}
        </span>
      ),
    },
    { key: 'source', header: 'Comes from', render: (row) => <SourceBadge row={row} /> },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="oam-form-actions">
          <Button
            size="sm"
            variant="ghost"
            icon={<FiEdit2 />}
            onClick={() => setEditing(`${row.product}/${row.agentKey}`)}
          >
            {row.inherited ? 'Set' : 'Edit'}
          </Button>
          {row.inherited ? null : (
            <Button
              size="sm"
              variant="ghost"
              icon={<FiRotateCcw />}
              onClick={() => resetBinding(row)}
              title="Delete this binding so the agent inherits again"
            >
              Reset
            </Button>
          )}
        </div>
      ),
    },
  ]

  const loading = catalog.loading || effectiveLoading
  const error = catalog.error || effectiveError

  return (
    <Stack gap="sections">
      <PageHeader
        title="Agents & Models"
        description={
          'One row per agent each product has published. The effective model is what a job would actually '
          + 'run right now, and “Comes from” names the layer that supplied it — so an inherited value is never '
          + 'mistaken for one set here.'
        }
        meta={[
          { label: 'Editing', value: scope === 'user' ? userLabel : 'organisation bindings' },
          ...(personal ? [] : [{ label: 'Organisation', value: organizationId === 'all' ? 'default' : organizationId }]),
        ]}
        actions={personal ? null : (
          <Segmented
            aria-label="Which layer to edit"
            value={scope}
            onChange={setScope}
            items={[
              { value: 'org', label: 'Organisation' },
              { value: 'user', label: userLabel },
            ]}
          />
        )}
      />

      <ProjectWriteBanner
        hasConcreteProject={hasConcreteProject}
        selectionIsMulti={selectionIsMulti}
      />

      {error ? (
        <Banner tone="warning" title="Some values could not be read">
          {error}
        </Banner>
      ) : null}

      {!loading && !agents.length ? (
        <Card>
          <EmptyState
            icon={<FiCpu />}
            title="No product has published an agent catalog yet"
            description={
              'Products announce their agents on boot by POSTing to /api/agents/catalog/publish. An empty '
              + 'table means no product has started against this OAM, or PEER_OAM_URL is unset in the ones '
              + 'that have — not that there is nothing to configure.'
            }
          />
        </Card>
      ) : null}

      {groups.map((group) => (
        <Card
          key={group.product}
          title={group.product.toUpperCase()}
          description={`${group.rows.length} agent${group.rows.length === 1 ? '' : 's'} published by this product.`}
          flush
        >
          <Table
            aria-label={`${group.product} agents`}
            columns={columns}
            rows={group.rows}
            state={tableState({ loading, error: catalog.error, count: group.rows.length })}
            getRowKey={(row) => `${row.product}/${row.agentKey}`}
          />
          {group.rows
            .filter((row) => editing === `${row.product}/${row.agentKey}`)
            .map((row) => (
              <Card
                key={`edit-${row.agentKey}`}
                title={`${row.label} — ${scope === 'user' ? 'my override' : 'organisation binding'}`}
                description={row.sourceDetail}
                quiet
              >
                <BindingEditor
                  product={row.product}
                  agentKey={row.agentKey}
                  scope={scope}
                  current={row}
                  onDone={() => { setEditing(null); setReloadNonce((n) => n + 1) }}
                  onCancel={() => setEditing(null)}
                />
              </Card>
            ))}
        </Card>
      ))}
    </Stack>
  )
}
