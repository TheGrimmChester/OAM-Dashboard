import { describe, it, expect } from 'vitest'
import {
  disabledProductsList,
  productAccessSummary,
  phpExtensionSnippets,
  collectorSnippets,
} from './projectDetail'

describe('productAccessSummary', () => {
  it('reports all enabled when denylist is empty', () => {
    expect(productAccessSummary({ disabled_products: [] })).toBe('All products enabled')
    expect(productAccessSummary({})).toBe('All products enabled')
  })

  it('lists enabled and disabled when mixed', () => {
    expect(productAccessSummary({ disabled_products: ['opm'] })).toBe(
      'Enabled: OPA, OSA, ORA, OPL · Disabled: OPM',
    )
  })

  it('reports all disabled', () => {
    expect(productAccessSummary({
      disabled_products: ['opa', 'osa', 'ora', 'opl', 'opm'],
    })).toBe('All products disabled')
  })
})

describe('collectorSnippets', () => {
  it('emits ini, env, rum, and otlp forms without inventing default-org', () => {
    const s = collectorSnippets({ id: 'checkout-api', organization_id: 'nas' }, 'opa_deadbeef')
    expect(s.phpIni).toContain('opa.organization_id=nas')
    expect(s.phpIni).toContain('opa.project_id=checkout-api')
    expect(s.phpIni).toContain('opa.ingest_key=opa_deadbeef')
    expect(s.phpEnv).toContain('OPA_INGEST_KEY=opa_deadbeef')
    expect(s.rum).toContain('data-ingest-key="opa_deadbeef"')
    expect(s.otlp).toContain('Authorization: Bearer opa_deadbeef')
    expect(s.organizationId).toBe('nas')
  })

  it('leaves organization blank when empty (no default-org)', () => {
    const s = collectorSnippets({ id: 'personal-app', organization_id: '' })
    expect(s.organizationId).toBe('')
    expect(s.phpIni).not.toContain('default-org')
    expect(s.phpEnv).not.toContain('default-org')
    expect(s.projectId).toBe('personal-app')
  })
})

describe('phpExtensionSnippets', () => {
  it('stays compatible with legacy callers', () => {
    const s = phpExtensionSnippets({ id: 'checkout-api', organization_id: 'nas' }, 'opa_x')
    expect(s.ini).toContain('opa.ingest_key=opa_x')
    expect(s.env).toContain('OPA_INGEST_KEY=opa_x')
  })
})

describe('disabledProductsList', () => {
  it('normalises to lower-case strings', () => {
    expect(disabledProductsList({ disabled_products: ['OPM', ''] })).toEqual(['opm'])
  })
})
