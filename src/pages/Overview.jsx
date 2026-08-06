import React from 'react'
import { Link } from 'react-router-dom'
import {
  PageHeader, Card, Stack, Grid, StatTile, Badge, Banner, Button, DefinitionList,
} from '@open-family/ui'
import { FiCpu, FiKey, FiGitBranch, FiUsers, FiHome } from 'react-icons/fi'
import { useResource } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'

/**
 * What is configured, and whether the plane is actually serving.
 *
 * The counts are the useful part, but the honest part is the health strip: OAM
 * refuses to resolve credentials without a service JWT secret and refuses to
 * store them without an encryption key, and a console that showed four green
 * counts while resolution was disabled would be actively misleading. Those two
 * conditions are read from /api/health and stated first.
 */

function Count({ label, value, loading, error, icon, to }) {
  return (
    <StatTile
      label={label}
      value={error ? '—' : (loading ? '…' : String(value))}
      icon={icon}
      hint={error ? 'could not be read' : undefined}
      footer={to ? <Link to={to}>Manage</Link> : undefined}
    />
  )
}

export default function Overview() {
  const { organizationId, nonce } = useTenant()
  const deps = [organizationId, nonce]

  const health = useResource('/api/health', { fallback: {}, deps })
  const orgs = useResource('/api/organizations', { fallback: { organizations: [] }, deps })
  const users = useResource('/api/users', { fallback: { users: [] }, deps })
  const creds = useResource('/api/credentials', { fallback: { credentials: [] }, deps })
  const connectors = useResource('/api/connectors', { fallback: { connectors: [] }, deps })
  const catalog = useResource('/api/agents/catalog', { fallback: { agents: [] }, deps })

  const agents = catalog.data?.agents || []
  const products = [...new Set(agents.map((a) => a.product))].sort()

  // `=== false` rather than `!`: while the health request is in flight the fields
  // are absent, and a falsy check would flash a red "resolution is off" banner on
  // every page load of a perfectly healthy deployment.
  const resolveDisabled = health.data?.resolve_enabled === false
  const cryptoMissing = health.data?.secret_key_present === false
  const clickhouseDown = health.data?.clickhouse === false

  return (
    <Stack gap="sections">
      <PageHeader
        title="Overview"
        description={
          'OAM is the family’s account and configuration plane: the organisation directory, the users, the '
          + 'credentials jobs resolve, and the per-agent model bindings that decide which model runs which task.'
        }
        meta={[
          { label: 'Scope', value: organizationId === 'all' ? 'default organisation' : organizationId },
          { label: 'Service', value: health.data?.service || 'oam-api' },
        ]}
      />

      {resolveDisabled ? (
        <Banner tone="danger" title="Credential resolution is switched off">
          OAM will not serve plaintext keys to a peer it cannot authenticate, so
          <code> POST /api/agents/resolve</code> refuses while <code>OPEN_SERVICE_JWT_SECRET</code> is unset.
          Jobs will fail closed until it is set — the bindings below are stored, but unreachable.
        </Banner>
      ) : null}

      {cryptoMissing ? (
        <Banner tone="danger" title="No encryption key — credential writes will be refused">
          Set <code>OAM_SECRET_KEY</code>, reusing the existing <code>OPA_CONNECTOR_SECRET</code> so that
          ciphertext migrated from ORA stays decryptable.
        </Banner>
      ) : null}

      {clickhouseDown ? (
        <Banner tone="danger" title="ClickHouse is unreachable">
          The counts below are whatever the last successful read returned, which may be nothing. Nothing
          written now will persist.
        </Banner>
      ) : null}

      <Grid columns={4}>
        <Count
          label="Organisations" icon={<FiHome />} to="/organizations"
          value={(orgs.data?.organizations || []).length}
          loading={orgs.loading} error={orgs.error}
        />
        <Count
          label="Users" icon={<FiUsers />} to="/users"
          value={(users.data?.users || []).length}
          loading={users.loading} error={users.error}
        />
        <Count
          label="Credentials" icon={<FiKey />} to="/credentials"
          value={(creds.data?.credentials || []).length}
          loading={creds.loading} error={creds.error}
        />
        <Count
          label="Connectors" icon={<FiGitBranch />} to="/connectors"
          value={(connectors.data?.connectors || []).length}
          loading={connectors.loading} error={connectors.error}
        />
        <Count
          label="Configurable agents" icon={<FiCpu />} to="/agents"
          value={agents.length}
          loading={catalog.loading} error={catalog.error}
        />
      </Grid>

      <Card
        title="Products reporting agents"
        description={
          'Each product publishes its agent list on boot. A product missing here has not started against this '
          + 'OAM, or has PEER_OAM_URL unset — its jobs will use their own defaults rather than these bindings.'
        }
        actions={<Button size="sm" href="/agents">Configure models</Button>}
      >
        {products.length ? (
          <div className="oam-form-actions">
            {products.map((p) => {
              const count = agents.filter((a) => a.product === p).length
              return (
                <Badge key={p} tone="info" round title={`${count} agent${count === 1 ? '' : 's'} published`}>
                  {p.toUpperCase()} · {count}
                </Badge>
              )
            })}
          </div>
        ) : (
          <p className="oam-source-detail">
            No product has published a catalog yet. Nothing is broken — each product still runs with its own
            defaults — but per-agent model configuration only takes effect once a product announces its agents.
          </p>
        )}
      </Card>

      <Card title="How a job gets its key and its model">
        <DefinitionList
          items={[
            {
              term: 'At enqueue',
              value: 'The acting user, organisation, project and agent key are stamped onto the job row.',
            },
            {
              term: 'At run',
              value: 'One call resolves the credential and the model together, so the two can never disagree.',
            },
            {
              term: 'Precedence',
              value: 'Task override, then the user’s binding, then the organisation’s, then the product default, then the family default.',
            },
            {
              term: 'When nothing matches',
              value: 'The job fails with credential_unavailable. It never falls back to an admin key or an environment variable.',
            },
          ]}
        />
      </Card>
    </Stack>
  )
}
