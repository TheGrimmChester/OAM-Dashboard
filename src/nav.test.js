import { describe, it, expect } from 'vitest'
import { NAV_ITEMS, NAV_SECTIONS, OVERVIEW_ITEM, pageTitleForPath } from './nav'
import GLYPHS from './icons'

describe('the rail', () => {
  // The collapsed rail is icon-only. Two destinations sharing a glyph are then
  // literally indistinguishable, which is a navigation bug you cannot see in the
  // expanded state where the label carries the meaning.
  it('gives every destination its own glyph', () => {
    const icons = NAV_ITEMS.map((i) => i.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('has a glyph defined for every destination', () => {
    for (const item of NAV_ITEMS) {
      expect(GLYPHS[item.icon], `no glyph registered for "${item.icon}" (${item.to})`).toBeTruthy()
    }
  })

  it('routes to distinct paths, each absolute and query-free', () => {
    const paths = NAV_ITEMS.map((i) => i.to)
    expect(new Set(paths).size).toBe(paths.length)
    for (const to of paths) {
      expect(to.startsWith('/')).toBe(true)
      expect(to).not.toContain('?')
    }
  })

  it('labels every item', () => {
    for (const item of NAV_ITEMS) expect(item.label).toBeTruthy()
  })

  // Administration last is the family skeleton; the sections are the IA contract
  // shared with the other five consoles.
  it('ends with Administration', () => {
    expect(NAV_SECTIONS[NAV_SECTIONS.length - 1].id).toBe('admin')
  })

  it('pins Overview above the sections and matches it exactly', () => {
    expect(OVERVIEW_ITEM.exact).toBe(true)
    expect(NAV_SECTIONS.flatMap((s) => s.items).map((i) => i.to)).not.toContain(OVERVIEW_ITEM.to)
  })
})

describe('pageTitleForPath', () => {
  it('names each rail destination', () => {
    for (const item of NAV_ITEMS) {
      expect(pageTitleForPath(item.to), `no title for ${item.to}`).toBeTruthy()
    }
  })

  // `/settings/account` and a hypothetical `/settings` must not collide: the
  // longest matching prefix wins, so a nested route keeps its own title.
  it('prefers the longest matching prefix', () => {
    expect(pageTitleForPath('/settings/account')).toBe('Account')
  })

  it('matches sub-paths of a destination', () => {
    expect(pageTitleForPath('/organizations/acme')).toBe('Organisations')
  })

  // A prefix must not leak across sibling routes: `/agents` must not claim
  // `/agentsomething`.
  it('does not match a sibling route by bare string prefix', () => {
    expect(pageTitleForPath('/agentsomething')).toBeUndefined()
  })

  it('returns undefined for an unknown route so the tab falls back to the product', () => {
    expect(pageTitleForPath('/nope')).toBeUndefined()
  })
})
