import React, { useState } from 'react'
import axios from 'axios'
import { Card, Stack, Field, Input, Button, Banner } from '@open-family/ui'
import { apiUrl } from '../utils/apiBase'

/**
 * Sign in.
 *
 * OAM issues its own tokens — `users.go` owns `/api/auth/*` against the durable
 * user store — rather than proxying the hub the way the four peer dashboards do.
 * That is the point of the identity move: the issuer is backed by rows that
 * survive a restart.
 */
export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await axios.post(apiUrl('/api/auth/login'), { username, password })
      const token = r.data?.token
      if (!token) throw new Error('the service accepted the login but returned no token')
      localStorage.setItem('auth_token', token)
      localStorage.setItem('username', r.data?.username || username)
      localStorage.setItem('role', r.data?.role || '')
      // Land on the signing-in user's own organisation rather than the default
      // scope. Otherwise a member of one org opens the console pointed at
      // another one and edits the wrong bindings before noticing the top bar.
      if (r.data?.org_id) localStorage.setItem('oam_organization_id', r.data.org_id)
      setPassword('')
      // `next` is read back only as a path. An absolute URL here would make the
      // login page an open redirect for anyone who can hand someone a link.
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next')
      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/overview'
      window.location.assign(safe)
    } catch (err) {
      const status = err?.response?.status
      setError(status === 401
        ? 'Wrong username or password.'
        : String(err?.response?.data?.message || err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="oam-login">
      <Card title="Open Account Manager" description="Sign in to manage organisations, users, credentials and model bindings.">
        <form onSubmit={submit}>
          <Stack>
            {error ? <Banner tone="danger" title="Could not sign in">{error}</Banner> : null}
            <Field label="Username">
              <Input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="primary" block loading={busy} disabled={!username || !password}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Card>
    </div>
  )
}
