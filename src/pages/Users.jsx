import React, { useMemo, useState } from 'react'
import {
  PageHeader, Card, Stack, Table, Badge, Button, Field, Input, Select, Banner,
  EmptyState, useToast,
} from '@open-family/ui'
import { FiUsers, FiPlus, FiTrash2, FiUserCheck } from 'react-icons/fi'
import { useResource, post, tableState } from '../hooks/useApi'
import { useTenant } from '../contexts/TenantContext'
import {
  canManageDirectoryUsers,
  directoryNavVisibility,
  isOrganizationAccount,
  readAccountType,
  readRole,
} from '../utils/accountType'
import { beginImpersonation, canImpersonate } from '../utils/impersonation'

/**
 * Persistent users.
 *
 * Every product in the family used Open-Auth-Go's in-memory local issuer, so a
 * restart dropped every user, role and project ACL. These rows are stored in
 * ClickHouse and survive a restart — which is the difference between an account
 * and a session.
 *
 * Passwords are bcrypt-hashed by the service and never returned. There is no
 * "show password" affordance here for the same reason there is none on AI
 * Endpoints: the store genuinely cannot answer that question.
 */

const ROLES = [
  { value: 'viewer', label: 'viewer — read only' },
  { value: 'editor', label: 'editor — can change configuration' },
  { value: 'admin', label: 'admin — can manage users and org-scoped secrets' },
]

const ROLE_TONE = { admin: 'warning', editor: 'info', viewer: 'neutral' }

const ACCOUNT_TYPES_ALL = [
  { value: 'personal', label: 'Personal — individual account, no organisation' },
  { value: 'organization', label: 'Organisation member — belongs to one organisation' },
]

const ACCOUNT_TYPES_ORG_ONLY = [
  { value: 'organization', label: 'Organisation member — belongs to one organisation' },
]

function NewUser({ onDone, onCancel, allowPersonal }) {
  const toast = useToast()
  const { scopeLabel, organizationId } = useTenant()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('viewer')
  const [accountType, setAccountType] = useState(allowPersonal ? 'personal' : 'organization')
  const [explicitOrg, setExplicitOrg] = useState('')
  const [projectIds, setProjectIds] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const accountTypeOptions = allowPersonal ? ACCOUNT_TYPES_ALL : ACCOUNT_TYPES_ORG_ONLY

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = {
        username: username.trim(),
        password,
        role,
        account_type: accountType,
        project_ids: accountType === 'personal'
          ? []
          : projectIds.split(',').map((s) => s.trim()).filter(Boolean),
      }
      if (accountType === 'organization') {
        const org = (organizationId !== 'all' ? organizationId : explicitOrg.trim())
        if (!org) {
          setError('Pick an organisation in the top bar or enter one below.')
          setBusy(false)
          return
        }
        body.organization_id = org
      }
      await post('/api/users/set', body)
      setPassword('')
      toast.push({ tone: 'success', title: `${username.trim()} saved as ${role}` })
      onDone()
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack>
      {error ? <Banner tone="danger" title="Could not save the user">{error}</Banner> : null}
      {accountType === 'organization' ? (
        <Banner tone="accent" title={`This account will belong to ${scopeLabel}`}>
          The organisation comes from the scope in the top bar, or from the field below when the bar says default.
        </Banner>
      ) : (
        <Banner tone="accent" title="This is a personal account">
          Personal accounts never belong to an organisation. The type is fixed at creation.
        </Banner>
      )}
      <div className="oam-binding-editor">
        <Field label="Account type" hint="Immutable after the user is created.">
          <Select
            block
            options={accountTypeOptions}
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
          />
        </Field>
        {accountType === 'organization' && organizationId === 'all' ? (
          <Field label="Organisation" hint="Required for organisation members.">
            <Input
              value={explicitOrg}
              onChange={(e) => setExplicitOrg(e.target.value)}
              placeholder="acme"
            />
          </Field>
        ) : null}
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </Field>
        <Field
          label="Password"
          hint="Hashed with bcrypt before storage. Leave blank on an existing user to keep the current one."
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <Select block options={ROLES} value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        {accountType === 'organization' ? (
          <Field label="Project ACL" hint="Comma-separated project ids. Empty means every project in the org.">
            <Input value={projectIds} onChange={(e) => setProjectIds(e.target.value)} placeholder="checkout-api, billing" />
          </Field>
        ) : null}
      </div>
      <div className="oam-form-actions">
        <Button variant="primary" loading={busy} disabled={!username.trim()} onClick={save}>
          Save user
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Stack>
  )
}

export default function Users() {
  const toast = useToast()
  const { organizationId, nonce } = useTenant()
  const [adding, setAdding] = useState(false)
  const role = readRole()
  const accountType = readAccountType()
  const selfName = localStorage.getItem('username') || ''
  const canManage = useMemo(
    () => canManageDirectoryUsers({ role, accountType }),
    [role, accountType],
  )
  const showImpersonate = useMemo(() => canImpersonate({ role }), [role])
  const allowPersonal = useMemo(
    () => directoryNavVisibility({ role, accountType }).organizations,
    [role, accountType],
  )
  const orgScoped = isOrganizationAccount(accountType)

  const users = useResource('/api/users', { fallback: { users: [] }, deps: [organizationId, nonce] })
  const rows = users.data?.users || []

  const remove = async (row) => {
    try {
      await post('/api/users/delete', { username: row.username })
      toast.push({ tone: 'success', title: `${row.username} removed` })
      users.reload()
    } catch (err) {
      // The service refuses to delete the last admin — that 409 is the useful
      // message, so it is shown rather than replaced with a generic failure.
      toast.push({ tone: 'danger', title: 'Could not remove', description: String(err.message || err) })
    }
  }

  const impersonate = async (row) => {
    try {
      const data = await post('/api/auth/impersonate', { username: row.username })
      beginImpersonation(data)
      toast.push({ tone: 'success', title: `Acting as ${row.username}` })
      window.location.assign('/overview')
    } catch (err) {
      toast.push({
        tone: 'danger',
        title: 'Could not impersonate',
        description: String(err.message || err),
      })
    }
  }

  const columns = [
    { key: 'username', header: 'Username', mono: true },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <Badge tone={ROLE_TONE[row.role] || 'neutral'} dot title={`Role: ${row.role}`}>{row.role}</Badge>
      ),
    },
    {
      key: 'account_type',
      header: 'Account type',
      render: (row) => (
        <Badge tone={row.account_type === 'personal' ? 'success' : 'info'} dot>
          {row.account_type || (row.organization_id ? 'organization' : 'personal')}
        </Badge>
      ),
    },
    {
      key: 'organization_id',
      header: 'Organisation',
      render: (row) => <span className="oam-mono">{row.organization_id || '—'}</span>,
    },
    {
      key: 'project_ids',
      header: 'Project ACL',
      render: (row) => {
        const type = row.account_type || (row.organization_id ? 'organization' : 'personal')
        if (type === 'personal') return <span className="oam-inherited-value">—</span>
        return row.project_ids?.length
          ? <span className="oam-mono">{row.project_ids.join(', ')}</span>
          : <span className="oam-inherited-value">every project</span>
      },
    },
    { key: 'updated_at', header: 'Updated', render: (row) => row.updated_at || '—' },
    ...(canManage || showImpersonate ? [{
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="oam-form-actions">
          {showImpersonate && row.username !== selfName ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<FiUserCheck />}
              onClick={() => impersonate(row)}
            >
              Impersonate
            </Button>
          ) : null}
          {canManage ? (
            <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => remove(row)}>Remove</Button>
          ) : null}
        </div>
      ),
    }] : []),
  ]

  return (
    <Stack gap="sections">
      <PageHeader
        title="Users"
        description={
          orgScoped
            ? 'Members of your organisation. Personal accounts and other organisations are not listed here.'
            : 'Accounts stored in OAM, not in a process. These survive a restart, and the tokens minted for them '
              + 'validate across every family product that shares JWT_SECRET.'
        }
        meta={[
          { label: 'Organisation', value: organizationId === 'all' ? (orgScoped ? '—' : 'all') : organizationId },
          { label: 'Users', value: String(rows.length) },
        ]}
        actions={canManage ? (
          <Button variant="primary" icon={<FiPlus />} onClick={() => setAdding((v) => !v)}>
            New user
          </Button>
        ) : null}
      />

      {adding && canManage ? (
        <Card title="New user" quiet>
          <NewUser
            allowPersonal={allowPersonal}
            onDone={() => { setAdding(false); users.reload() }}
            onCancel={() => setAdding(false)}
          />
        </Card>
      ) : null}

      <Card flush>
        <Table
          aria-label="Users"
          columns={columns}
          rows={rows}
          state={tableState({ loading: users.loading, error: users.error, count: rows.length })}
          getRowKey={(row) => row.username}
          emptyState={
            <EmptyState
              icon={<FiUsers />}
              title="No users are stored"
              description={
                'OAM seeds a lab admin only when the store is genuinely empty, so an empty list here means '
                + 'the seed account was deliberately deleted — it will not come back on restart.'
              }
            />
          }
          errorState={
            <EmptyState
              icon={<FiUsers />}
              title="The user list could not be read"
              description={users.error || 'The service did not answer.'}
              actions={<Button size="sm" onClick={users.reload}>Retry</Button>}
            />
          }
        />
      </Card>
    </Stack>
  )
}
