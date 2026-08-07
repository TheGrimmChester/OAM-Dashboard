import { describe, it, expect } from 'vitest'
import {
  discoveryRowKey,
  normalizeExternalKey,
  sanitizeDirectorySlug,
  suggestSlugFromExternalKey,
  connectorsNeedingAttach,
  discoveredRowActionable,
  isValidProjectId,
} from './projectImport'

describe('normalizeExternalKey', () => {
  it('lowercases owner/repo', () => {
    expect(normalizeExternalKey('Acme/Checkout-API')).toBe('acme/checkout-api')
  })

  it('rejects single-segment keys', () => {
    expect(normalizeExternalKey('orphan')).toBe('')
  })
})

describe('suggestSlugFromExternalKey', () => {
  it('uses the repo short name', () => {
    expect(suggestSlugFromExternalKey('acme/checkout-api')).toBe('checkout-api')
  })

  it('sanitizes odd characters', () => {
    expect(suggestSlugFromExternalKey('acme/My Repo!')).toBe('my-repo')
  })
})

describe('sanitizeDirectorySlug / isValidProjectId', () => {
  it('accepts valid ids', () => {
    expect(isValidProjectId('checkout-api')).toBe(true)
    expect(sanitizeDirectorySlug('Checkout_API')).toBe('checkout_api')
  })

  it('rejects empty after sanitize', () => {
    expect(sanitizeDirectorySlug('!!!')).toBe('')
  })
})

describe('discoveryRowKey', () => {
  it('prefers external_id', () => {
    expect(discoveryRowKey({ external_id: '123', external_key: 'a/b' })).toBe('id:123')
  })

  it('falls back to normalized key', () => {
    expect(discoveryRowKey({ external_id: '', external_key: 'Acme/Repo' })).toBe('key:acme/repo')
  })
})

describe('connectorsNeedingAttach / discoveredRowActionable', () => {
  const projects = [
    { id: 'checkout-api', connector_ids: ['conn-a'] },
  ]

  it('lists missing connectors on an imported row', () => {
    const row = {
      already_imported: true,
      project_id: 'checkout-api',
      connector_ids: ['conn-a', 'conn-b'],
    }
    expect(connectorsNeedingAttach(row, projects)).toEqual(['conn-b'])
    expect(discoveredRowActionable(row, projects)).toBe(true)
  })

  it('is not actionable when fully linked', () => {
    const row = {
      already_imported: true,
      project_id: 'checkout-api',
      connector_ids: ['conn-a'],
    }
    expect(connectorsNeedingAttach(row, projects)).toEqual([])
    expect(discoveredRowActionable(row, projects)).toBe(false)
  })

  it('treats new repos with connectors as actionable', () => {
    const row = {
      already_imported: false,
      project_id: '',
      connector_ids: ['conn-a'],
    }
    expect(discoveredRowActionable(row, projects)).toBe(true)
  })

  it('shows imported badge semantics: actionable false when no connectors at all', () => {
    const row = {
      already_imported: false,
      project_id: '',
      connector_ids: [],
    }
    expect(discoveredRowActionable(row, projects)).toBe(false)
  })
})
