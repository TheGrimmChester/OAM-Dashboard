import React, { useState } from 'react'
import {
  PageHeader, Card, Stack, DefinitionList, Field, Input, Button, Banner, Badge, useToast,
} from '@open-family/ui'
import { post, useResource } from '../hooks/useApi'
import { API_URLS } from '../utils/apiBase'

/**
 * Self-service: who you are signed in as, and your own password.
 *
 * This is the page the other five consoles now deep-link to. Their local
 * `Account.jsx` keeps logout and the token display — a session is local to a
 * product — but the account itself lives here, because there is one account
 * across the family rather than five.
 */
export default function Account() {
  const toast = useToast()
  const status = useResource('/api/auth/status', { fallback: {} })
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const username = localStorage.getItem('username') || ''
  const role = localStorage.getItem('role') || ''

  const mismatch = next && confirm && next !== confirm
  // The service enforces 8 characters. Stating it here turns a round-trip 400
  // into a hint the reader sees while typing.
  const tooShort = next && next.length < 8

  const change = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/api/account/password', { current_password: current, new_password: next })
      // Clear all three immediately: a password left in state after the request
      // has succeeded is in a heap snapshot for as long as this page lives.
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.push({ tone: 'success', title: 'Password changed' })
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="sections">
      <PageHeader
        title="Account"
        description="Your identity across the family. One account, used by every product that shares this OAM."
      />

      <Card title="Signed in as">
        <DefinitionList
          items={[
            { term: 'Username', value: username || '(not stored locally)', mono: true },
            {
              term: 'Role',
              value: role
                ? <Badge tone={role === 'admin' ? 'warning' : 'neutral'} dot>{role}</Badge>
                : '—',
            },
            { term: 'Issuer', value: status.data?.issuer || 'oam-api', mono: true },
            {
              term: 'Auth enforced',
              value: status.data?.auth_required === false
                ? 'no — this deployment accepts unauthenticated requests'
                : 'yes',
            },
            { term: 'API', value: API_URLS.OAM_URL || 'same origin', mono: true },
          ]}
        />
      </Card>

      <Card
        title="Change password"
        description="Stored as a bcrypt hash, independent of JWT_SECRET — rotating the signing secret does not invalidate it."
      >
        <Stack>
          {error ? <Banner tone="danger" title="The password was not changed">{error}</Banner> : null}
          <div className="oam-binding-editor">
            <Field label="Current password">
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field
              label="New password"
              hint="At least 8 characters."
              error={tooShort ? 'Too short — the service requires at least 8 characters.' : null}
            >
              <Input
                type="password"
                autoComplete="new-password"
                invalid={!!tooShort}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <Field
              label="Confirm new password"
              error={mismatch ? 'The two entries do not match.' : null}
            >
              <Input
                type="password"
                autoComplete="new-password"
                invalid={!!mismatch}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </div>
          <div className="oam-form-actions">
            <Button
              variant="primary"
              loading={busy}
              disabled={!current || !next || !!mismatch || !!tooShort}
              onClick={change}
            >
              Change password
            </Button>
          </div>
        </Stack>
      </Card>
    </Stack>
  )
}
