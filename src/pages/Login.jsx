import React, { useState } from 'react'
import { FiKey, FiLogIn } from 'react-icons/fi'
import axios from 'axios'
import { Card, Stack, Field, Input, Button, Banner, Textarea } from '@open-family/ui'
import { apiUrl } from '../utils/apiBase'
import { decodeJwtPayload, persistAccountFromLogin, persistAccountFromToken } from '../utils/accountType'

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
  const [showToken, setShowToken] = useState(false)
  const [token, setToken] = useState(() => localStorage.getItem('auth_token') || '')

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
      // account_type + org_id decide whether the org switcher is shown and locked.
      persistAccountFromLogin(r.data)
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

  const saveToken = (event) => {
    event.preventDefault()
    const value = token.trim()
    if (value) {
      localStorage.setItem('auth_token', value)
      persistAccountFromToken(value)
      const claims = decodeJwtPayload(value)
      if (claims?.username) localStorage.setItem('username', claims.username)
      if (claims?.role) localStorage.setItem('role', claims.role)
    } else {
      localStorage.removeItem('auth_token')
    }
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/overview'
    window.location.assign(safe)
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

        <Button variant="ghost" icon={<FiKey />} block onClick={() => setShowToken((v) => !v)}>
          {showToken ? 'Hide token paste' : 'Paste a bearer token instead'}
        </Button>

        {showToken ? (
          <form onSubmit={saveToken}>
            <Stack>
              <Field
                label="Bearer token"
                hint="An OAM-issued JWT. Saving it here signs this browser in without a password round-trip."
              >
                <Textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste an OAM-issued JWT"
                  rows={4}
                />
              </Field>
              <Button type="submit" variant="primary" icon={<FiLogIn />} block>
                {token.trim() ? 'Save and continue' : 'Continue without a token'}
              </Button>
            </Stack>
          </form>
        ) : null}
      </Card>
    </div>
  )
}
