import { beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_SESSION_KEY,
  ADMIN_TOKEN_KEY,
  beginImpersonation,
  canImpersonate,
  clearImpersonationStash,
  endImpersonation,
  isImpersonating,
  readImpersonator,
} from './impersonation'

function fakeJwt(claims) {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify(claims))
  return `${header}.${payload}.sig`
}

describe('canImpersonate', () => {
  it('allows admins who are not already impersonating', () => {
    expect(canImpersonate({ role: 'admin', impersonating: false })).toBe(true)
    expect(canImpersonate({ role: 'Admin', impersonating: false })).toBe(true)
  })

  it('denies non-admins and active impersonation', () => {
    expect(canImpersonate({ role: 'editor', impersonating: false })).toBe(false)
    expect(canImpersonate({ role: 'admin', impersonating: true })).toBe(false)
  })
})

describe('begin/end impersonation', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      store: {},
      getItem(k) { return this.store[k] ?? null },
      setItem(k, v) { this.store[k] = String(v) },
      removeItem(k) { delete this.store[k] },
    }
    localStorage.setItem('auth_token', 'admin-jwt')
    localStorage.setItem('username', 'admin')
    localStorage.setItem('role', 'admin')
    localStorage.setItem('account_type', 'personal')
  })

  it('stashes the admin session and switches identity', () => {
    beginImpersonation({
      token: fakeJwt({ username: 'solo', role: 'editor', account_type: 'personal', impersonator: 'admin' }),
      username: 'solo',
      role: 'editor',
      account_type: 'personal',
      org_id: '',
      impersonator: 'admin',
    })
    expect(isImpersonating()).toBe(true)
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe('admin-jwt')
    expect(localStorage.getItem('username')).toBe('solo')
    expect(localStorage.getItem('role')).toBe('editor')
    expect(readImpersonator()).toBe('admin')
  })

  it('restores the admin session on end', () => {
    beginImpersonation({
      token: fakeJwt({ username: 'solo', role: 'editor', account_type: 'personal', impersonator: 'admin' }),
      username: 'solo',
      role: 'editor',
      account_type: 'personal',
      org_id: '',
      impersonator: 'admin',
    })
    endImpersonation()
    expect(isImpersonating()).toBe(false)
    expect(localStorage.getItem('auth_token')).toBe('admin-jwt')
    expect(localStorage.getItem('username')).toBe('admin')
    expect(localStorage.getItem('role')).toBe('admin')
    expect(localStorage.getItem(ADMIN_SESSION_KEY)).toBeNull()
  })

  it('clears stash without restoring when asked', () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, 'x')
    localStorage.setItem(ADMIN_SESSION_KEY, '{}')
    clearImpersonationStash()
    expect(isImpersonating()).toBe(false)
  })
})
