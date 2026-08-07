import { describe, it, expect } from 'vitest'
import {
  canManageDirectoryUsers,
  directoryNavVisibility,
} from './accountType'

describe('directoryNavVisibility', () => {
  it('shows Users and Organisations to the unbound platform admin', () => {
    expect(directoryNavVisibility({ role: 'admin', accountType: 'personal' })).toEqual({
      users: true,
      organizations: true,
    })
    expect(directoryNavVisibility({ role: 'admin', accountType: '' })).toEqual({
      users: true,
      organizations: true,
    })
  })

  it('shows Users only for organisation accounts', () => {
    expect(directoryNavVisibility({ role: 'viewer', accountType: 'organization' })).toEqual({
      users: true,
      organizations: false,
    })
    expect(directoryNavVisibility({ role: 'admin', accountType: 'organization' })).toEqual({
      users: true,
      organizations: false,
    })
  })

  it('hides both for personal non-admins', () => {
    expect(directoryNavVisibility({ role: 'editor', accountType: 'personal' })).toEqual({
      users: false,
      organizations: false,
    })
    expect(directoryNavVisibility({ role: 'viewer', accountType: 'personal' })).toEqual({
      users: false,
      organizations: false,
    })
  })
})

describe('canManageDirectoryUsers', () => {
  it('allows platform admin and org editor/admin', () => {
    expect(canManageDirectoryUsers({ role: 'admin', accountType: 'personal' })).toBe(true)
    expect(canManageDirectoryUsers({ role: 'editor', accountType: 'organization' })).toBe(true)
    expect(canManageDirectoryUsers({ role: 'admin', accountType: 'organization' })).toBe(true)
  })

  it('denies personal non-admin and org viewer', () => {
    expect(canManageDirectoryUsers({ role: 'editor', accountType: 'personal' })).toBe(false)
    expect(canManageDirectoryUsers({ role: 'viewer', accountType: 'organization' })).toBe(false)
  })
})
