import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  PageHeader, Card, Stack, Banner, EmptyState, Badge, Button, Spinner, useToast,
} from '@open-family/ui'
import { FiFolder, FiArrowLeft, FiExternalLink } from 'react-icons/fi'
import { useResource, post } from '../hooks/useApi'
import { useTenant, ALL } from '../contexts/TenantContext'
import CopyField from '../components/CopyField'
import {
  PRODUCT_CODES,
  PRODUCT_LABELS,
  disabledProductsList,
  productAccessSummary,
  collectorSnippets,
} from '../utils/projectDetail'

function CopyRow({ term, value, mono = true, copyText, children }) {
  const text = copyText != null ? copyText : (value == null ? '' : String(value))
  const empty = text === '' || text === '—'
  return (
    <div className="oam-copy-row">
      <div className="oam-copy-row__term">{term}</div>
      <div className={`oam-copy-row__value${mono ? ' oam-mono' : ''}`}>
        {children != null ? children : (empty ? <span className="oam-inherited-value">—</span> : value)}
      </div>
      <CopyField text={empty ? '' : text} disabled={empty} />
    </div>
  )
}

function ProductChips({ row }) {
  const disabled = new Set(disabledProductsList(row))
  return (
    <div className="oam-chip-row">
      {PRODUCT_CODES.map((code) => (
        <Badge
          key={code}
          tone={disabled.has(code) ? 'neutral' : 'accent'}
          dot
          title={disabled.has(code) ? `${PRODUCT_LABELS[code]} disabled` : `${PRODUCT_LABELS[code]} enabled`}
        >
          {PRODUCT_LABELS[code]}{disabled.has(code) ? ' off' : ''}
        </Badge>
      ))}
    </div>
  )
}

export default function ProjectDetail() {
  const { id: rawId } = useParams()
  const id = decodeURIComponent(rawId || '').trim()
  const navigate = useNavigate()
  const toast = useToast()
  const { organizationId, isPersonalAccount } = useTenant()
  const [revealedKey, setRevealedKey] = useState('')
  const [busy, setBusy] = useState(false)

  const orgQ = (!isPersonalAccount && organizationId && organizationId !== ALL)
    ? `?organization_id=${encodeURIComponent(organizationId)}`
    : ''
  const detail = useResource(id ? `/api/projects/${encodeURIComponent(id)}${orgQ}` : '', {
    fallback: { project: null },
    deps: [id, organizationId, isPersonalAccount],
    skip: !id,
  })
  const keysRes = useResource(id ? `/api/projects/${encodeURIComponent(id)}/ingest-keys${orgQ}` : '', {
    fallback: { keys: [] },
    deps: [id, organizationId, isPersonalAccount],
    skip: !id,
  })

  const project = detail.data?.project || null
  const keys = keysRes.data?.keys || []
  const snippets = useMemo(
    () => (project ? collectorSnippets(project, revealedKey) : null),
    [project, revealedKey],
  )

  const copySnippet = async (text, title) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.push({ tone: 'success', title: title || 'Copied' })
    } catch {
      toast.push({ tone: 'danger', title: 'Could not copy' })
    }
  }

  const mintKey = async () => {
    setBusy(true)
    try {
      const body = await post(`/api/projects/${encodeURIComponent(id)}/ingest-keys${orgQ}`, { name: 'OPA ingest' })
      setRevealedKey(body.key || '')
      toast.push({ tone: 'success', title: 'Ingest key created — copy it now' })
      keysRes.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: err?.message || String(err) })
    } finally {
      setBusy(false)
    }
  }

  const rotateKey = async (keyId) => {
    setBusy(true)
    try {
      const body = await post(
        `/api/projects/${encodeURIComponent(id)}/ingest-keys/${encodeURIComponent(keyId)}/rotate${orgQ}`,
        {},
      )
      setRevealedKey(body.key || '')
      toast.push({ tone: 'success', title: 'Key rotated — copy the new secret now' })
      keysRes.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: err?.message || String(err) })
    } finally {
      setBusy(false)
    }
  }

  const revokeKey = async (keyId) => {
    setBusy(true)
    try {
      await post(
        `/api/projects/${encodeURIComponent(id)}/ingest-keys/${encodeURIComponent(keyId)}/revoke${orgQ}`,
        {},
      )
      if (revealedKey) setRevealedKey('')
      toast.push({ tone: 'success', title: 'Ingest key revoked' })
      keysRes.reload()
    } catch (err) {
      toast.push({ tone: 'danger', title: err?.message || String(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!id) {
    return (
      <Stack gap="sections">
        <EmptyState
          icon={<FiFolder />}
          title="Missing project id"
          description="Open a project from the directory list."
          actions={<Button size="sm" onClick={() => navigate('/projects')}>Back to projects</Button>}
        />
      </Stack>
    )
  }

  if (detail.loading && !project) {
    return (
      <div className="oam-route-loading">
        <Spinner label="Loading project" />
      </div>
    )
  }

  if (detail.error || !project) {
    return (
      <Stack gap="sections">
        <PageHeader
          breadcrumbs={[
            { label: 'Projects', onClick: () => navigate('/projects') },
            { label: id },
          ]}
          title={id}
          mono
        />
        <EmptyState
          icon={<FiFolder />}
          title="Project not found"
          description={detail.error || 'This id is not in the directory for the current organisation.'}
          actions={(
            <div className="oam-form-actions">
              <Button size="sm" variant="ghost" icon={<FiArrowLeft />} onClick={() => navigate('/projects')}>
                Back to projects
              </Button>
              <Button size="sm" onClick={detail.reload}>Retry</Button>
            </div>
          )}
        />
      </Stack>
    )
  }

  const source = (project.source || 'manual').toLowerCase()
  const disabledJSON = JSON.stringify(disabledProductsList(project))
  const personal = Boolean(String(project.user_id || '').trim())
  const activeKeys = keys.filter((k) => !k.revoked)

  return (
    <Stack gap="sections">
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', onClick: () => navigate('/projects') },
          { label: project.id },
        ]}
        title={project.id}
        mono
        description={
          'Directory identity for family tenant headers and OPA ingest. '
          + 'Mint a project ingest key, then copy collector snippets.'
        }
        meta={[
          { label: 'Organisation', value: project.organization_id || '—' },
          { label: 'Source', value: source },
          { label: 'Updated', value: project.updated_at || '—' },
        ]}
        actions={(
          <Button variant="ghost" icon={<FiArrowLeft />} onClick={() => navigate('/projects')}>
            Back to list
          </Button>
        )}
      />

      {personal ? (
        <Banner tone="accent" title="Personal project">
          Owned by user <span className="oam-mono">{project.user_id}</span>.
          Leave organisation blank in collectors when the directory org id is empty;
          the ingest key binds the tenant.
        </Banner>
      ) : null}

      <Card
        title="Tenant identity"
        description="Used as X-Organization-ID / X-Project-ID across the family."
      >
        <CopyRow term="Project ID" value={project.id} />
        <CopyRow term="Organization ID" value={project.organization_id} />
        {personal ? <CopyRow term="User ID" value={project.user_id} /> : null}
        <CopyRow term="Name" value={project.name || project.id} mono={false} />
        {project.description ? (
          <CopyRow term="Description" value={project.description} mono={false} />
        ) : null}
        <div className="oam-copy-row">
          <div className="oam-copy-row__term">Source</div>
          <div className="oam-copy-row__value">
            {source === 'github'
              ? <Badge tone="accent" dot>github</Badge>
              : <Badge tone="neutral" dot>manual</Badge>}
          </div>
          <CopyField text={source} />
        </div>
      </Card>

      <Card
        title="OPA ingest key"
        description="Per-project secret for OPA-Agent ingest. Plaintext is shown once at mint/rotate."
      >
        {revealedKey ? (
          <Banner tone="warning" title="Copy this key now">
            It will not be shown again.
            <pre className="oam-snippet" style={{ marginTop: 'var(--space-2)' }}>{revealedKey}</pre>
            <div className="oam-form-actions" style={{ marginTop: 'var(--space-2)' }}>
              <Button size="sm" variant="primary" onClick={() => copySnippet(revealedKey, 'Key copied')}>
                Copy key
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealedKey('')}>Dismiss</Button>
            </div>
          </Banner>
        ) : null}

        {keysRes.loading && !keys.length ? <Spinner label="Loading keys" /> : null}
        {keysRes.error ? (
          <Banner tone="danger" title="Could not load keys">{keysRes.error}</Banner>
        ) : null}

        {activeKeys.length === 0 && !keysRes.loading ? (
          <EmptyState
            icon={<FiFolder />}
            title="No ingest keys"
            description="Generate a key to authenticate PHP, node, python, collector, RUM, and OTLP."
            actions={(
              <Button size="sm" variant="primary" disabled={busy} onClick={mintKey}>
                Generate ingest key
              </Button>
            )}
          />
        ) : (
          <>
            {activeKeys.map((k) => (
              <div key={k.id} className="oam-copy-row">
                <div className="oam-copy-row__term">{k.key_prefix || k.id}</div>
                <div className="oam-copy-row__value oam-mono">
                  {k.name || 'OPA ingest'} · created {k.created_at || '—'}
                </div>
                <div className="oam-form-actions">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => rotateKey(k.id)}>
                    Rotate
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => revokeKey(k.id)}>
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
            <div className="oam-form-actions" style={{ marginTop: 'var(--space-3)' }}>
              <Button size="sm" variant="secondary" disabled={busy} onClick={mintKey}>
                Generate another key
              </Button>
            </div>
          </>
        )}
      </Card>

      {(project.external_id || project.external_key || project.html_url || project.default_branch
        || (project.connector_ids || []).length) ? (
        <Card title="GitHub linkage" description="Present when imported from connectors.">
          {project.external_key ? <CopyRow term="External key" value={project.external_key} /> : null}
          {project.external_id ? <CopyRow term="External ID" value={project.external_id} /> : null}
          {project.html_url ? (
            <CopyRow term="HTML URL" value={project.html_url}>
              <a className="oam-mono" href={project.html_url} target="_blank" rel="noreferrer">
                {project.html_url} <FiExternalLink aria-hidden />
              </a>
            </CopyRow>
          ) : null}
          {project.default_branch ? (
            <CopyRow term="Default branch" value={project.default_branch} />
          ) : null}
          {(project.connector_ids || []).length ? (
            <CopyRow
              term="Connector IDs"
              value={(project.connector_ids || []).join(', ')}
              copyText={(project.connector_ids || []).join('\n')}
            >
              <div className="oam-chip-row">
                {(project.connector_ids || []).map((cid) => (
                  <Badge key={cid} tone="neutral" title={cid}>{cid}</Badge>
                ))}
              </div>
            </CopyRow>
          ) : null}
        </Card>
      ) : null}

      <Card
        title="Product access"
        description="Empty denylist means every family product may use this project. Edit the matrix on the projects list."
      >
        <div className="oam-copy-row">
          <div className="oam-copy-row__term">Summary</div>
          <div className="oam-copy-row__value">
            <div>{productAccessSummary(project)}</div>
            <ProductChips row={project} />
          </div>
          <CopyField text={productAccessSummary(project)} />
        </div>
        <CopyRow term="disabled_products" value={disabledJSON} />
        <div className="oam-form-actions" style={{ marginTop: 'var(--space-3)' }}>
          <Button size="sm" variant="secondary" onClick={() => navigate('/projects')}>
            Edit product matrix
          </Button>
        </div>
      </Card>

      <Card
        title="Collector snippets"
        description="PHP extension, node, python, collector, RUM, and OTLP. Snippets include the revealed key when present."
      >
        <pre className="oam-snippet">{snippets.full}</pre>
        <div className="oam-form-actions" style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="primary" size="sm" onClick={() => copySnippet(snippets.full, 'Snippet copied')}>
            Copy full snippet
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copySnippet(snippets.phpIni, 'INI copied')}>
            PHP INI
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copySnippet(snippets.phpEnv, 'Env copied')}>
            Env
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copySnippet(snippets.rum, 'RUM copied')}>
            RUM
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copySnippet(snippets.otlp, 'OTLP copied')}>
            OTLP
          </Button>
        </div>
      </Card>

      {(project.created_at || project.updated_at) ? (
        <Card title="Timestamps" quiet>
          {project.created_at ? <CopyRow term="Created" value={project.created_at} /> : null}
          {project.updated_at ? <CopyRow term="Updated" value={project.updated_at} /> : null}
        </Card>
      ) : null}
    </Stack>
  )
}
