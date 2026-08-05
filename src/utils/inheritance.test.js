import { describe, it, expect } from 'vitest'
import {
  describeSource, isInheritedFor, buildAgentRow, groupByProduct, summarizeBinding,
  SOURCE_ORDER, UNKNOWN_SOURCE,
  SOURCE_TASK_OVERRIDE, SOURCE_USER, SOURCE_ORG, SOURCE_PRODUCT_DEFAULT, SOURCE_FAMILY_DEFAULT,
} from './inheritance'

describe('describeSource', () => {
  it('knows every layer OAM can report', () => {
    for (const source of SOURCE_ORDER) {
      const info = describeSource(source)
      expect(info.id, `${source} is unmapped`).toBe(source)
      expect(info.label).toBeTruthy()
      expect(info.detail).toBeTruthy()
    }
  })

  // A source string this build does not recognise must be surfaced, not blanked.
  // The alternative is an empty cell that reads as "nothing is configured" on a
  // row that is in fact resolving fine from a newer layer.
  it('reports an unknown layer rather than rendering nothing', () => {
    const info = describeSource('project_default')
    expect(info).toBe(UNKNOWN_SOURCE)
    expect(info.inherited).toBe(true)
  })

  it('is case- and whitespace-tolerant about the wire value', () => {
    expect(describeSource('  ORG ').id).toBe(SOURCE_ORG)
  })

  it('treats a missing source as unknown, not as a configured value', () => {
    expect(describeSource(undefined)).toBe(UNKNOWN_SOURCE)
    expect(describeSource('')).toBe(UNKNOWN_SOURCE)
  })
})

describe('isInheritedFor', () => {
  // The same binding is "mine" or "inherited" depending on which level the
  // console is editing. This is the assertion that keeps "Reset to inherited"
  // off rows with nothing to reset.
  it('an org-scoped value is owned when editing org, inherited when editing user', () => {
    expect(isInheritedFor(SOURCE_ORG, 'org')).toBe(false)
    expect(isInheritedFor(SOURCE_ORG, 'user')).toBe(true)
  })

  it('a user override is owned at both levels an admin can edit', () => {
    expect(isInheritedFor(SOURCE_USER, 'user')).toBe(false)
    expect(isInheritedFor(SOURCE_USER, 'org')).toBe(false)
  })

  it('product and family defaults are inherited everywhere', () => {
    for (const scope of ['user', 'org']) {
      expect(isInheritedFor(SOURCE_PRODUCT_DEFAULT, scope)).toBe(true)
      expect(isInheritedFor(SOURCE_FAMILY_DEFAULT, scope)).toBe(true)
    }
  })

  it('a task override is never presented as inherited', () => {
    expect(isInheritedFor(SOURCE_TASK_OVERRIDE, 'user')).toBe(false)
    expect(isInheritedFor(SOURCE_TASK_OVERRIDE, 'org')).toBe(false)
  })

  // Failing closed here matters: claiming a value is locally owned when we cannot
  // tell would offer a reset that silently does nothing.
  it('fails to "inherited" for an unrecognised editing scope', () => {
    expect(isInheritedFor(SOURCE_ORG, 'team')).toBe(true)
    expect(isInheritedFor(SOURCE_ORG, undefined)).toBe(true)
  })
})

describe('buildAgentRow', () => {
  const catalog = {
    product: 'opm', agent_key: 'planning', label: 'Planning', tier_hint: 'light', ai_backed: true,
  }

  it('carries the catalog label and the effective binding together', () => {
    const row = buildAgentRow(catalog, { provider: 'cli_cursor', model: 'auto', source: 'org' }, 'org')
    expect(row.label).toBe('Planning')
    expect(row.tierHint).toBe('light')
    expect(row.model).toBe('auto')
    expect(row.inherited).toBe(false)
    expect(row.sourceLabel).toBe('Organisation')
    expect(row.unresolved).toBe(false)
  })

  // The catalog is authoritative for which agents exist, so an agent with no
  // stored binding still gets a row — otherwise nobody learns it is configurable.
  it('produces a row for an agent that has no binding at all', () => {
    const row = buildAgentRow(catalog, null, 'org')
    expect(row.agentKey).toBe('planning')
    expect(row.unresolved).toBe(true)
    expect(row.inherited).toBe(true)
  })

  // An API that answers with neither provider nor model has told us the agent
  // would fail closed. That must look different from a configured row.
  it('marks a resolved-to-nothing binding as unresolved', () => {
    const row = buildAgentRow(catalog, { provider: '', model: '', source: 'family_default' }, 'org')
    expect(row.unresolved).toBe(true)
  })

  it('falls back to the agent key when the catalog has no label', () => {
    const row = buildAgentRow({ product: 'opm', agent_key: 'qa_fix' }, { provider: 'openai', model: 'x' }, 'org')
    expect(row.label).toBe('qa_fix')
  })

  it('treats ai_backed as true unless explicitly false', () => {
    expect(buildAgentRow({ agent_key: 'a' }, {}, 'org').aiBacked).toBe(true)
    expect(buildAgentRow({ agent_key: 'a', ai_backed: false }, {}, 'org').aiBacked).toBe(false)
  })
})

describe('groupByProduct', () => {
  it('groups and sorts, keeping row order within a product', () => {
    const rows = [
      { product: 'opm', agentKey: 'planning' },
      { product: 'ora', agentKey: 'bugbot' },
      { product: 'opm', agentKey: 'coding' },
    ]
    const groups = groupByProduct(rows)
    expect(groups.map((g) => g.product)).toEqual(['opm', 'ora'])
    expect(groups[0].rows.map((r) => r.agentKey)).toEqual(['planning', 'coding'])
  })

  it('does not drop a row with no product', () => {
    expect(groupByProduct([{ agentKey: 'x' }])[0].product).toBe('unknown')
  })
})

describe('summarizeBinding', () => {
  // `auto` is a deliberate value in this family — Cursor picks the model — and
  // reads as an unset field if rendered bare.
  it('spells out what auto means', () => {
    expect(summarizeBinding({ provider: 'cli_cursor', model: 'auto' }))
      .toBe('cli_cursor · automatic model choice')
  })

  it('names an explicit model', () => {
    expect(summarizeBinding({ provider: 'anthropic', model: 'claude-opus-5' }))
      .toBe('anthropic · claude-opus-5')
  })

  it('says so when nothing resolved', () => {
    expect(summarizeBinding({})).toBe('Not resolved')
    expect(summarizeBinding({ provider: '  ', model: '' })).toBe('Not resolved')
  })
})
