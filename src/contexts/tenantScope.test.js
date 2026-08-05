import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/* The module reads localStorage at import time to seed the scope, so a stub has
   to exist before the import. `environment: 'node'` means there is no DOM. */
beforeAll(() => {
  globalThis.localStorage = {
    store: {},
    getItem(k) { return this.store[k] ?? null },
    setItem(k, v) { this.store[k] = String(v) },
    removeItem(k) { delete this.store[k] },
  }
})

const load = async () => import('./TenantContext.jsx')

describe('the scope headers stamped on every request', () => {
  // This is the regression that made the Agents & Models page lie. The
  // interceptor used to be re-registered by an effect keyed on the organisation,
  // which put it one commit behind: React runs a child's effects before its
  // parent's, so a page refetching on an org change sent its request through the
  // interceptor still carrying the previous org. The header read "acme" while
  // every row reported the family default.
  //
  // The fix is that the headers are computed at call time, so a scope change is
  // visible to the very next request with no render in between. That is exactly
  // what this asserts.
  it('reflects a change immediately, with no render in between', async () => {
    const { currentScopeHeaders, setScope } = await load()

    setScope({ organizationId: 'acme', projectId: 'checkout-api' })
    expect(currentScopeHeaders()).toEqual({
      'X-Organization-ID': 'acme',
      'X-Project-ID': 'checkout-api',
    })

    setScope({ organizationId: 'globex' })
    expect(currentScopeHeaders()['X-Organization-ID']).toBe('globex')
  })

  it('leaves the other axis alone when only one is set', async () => {
    const { currentScopeHeaders, setScope } = await load()
    setScope({ organizationId: 'acme', projectId: 'checkout-api' })
    setScope({ projectId: 'billing' })
    expect(currentScopeHeaders()).toEqual({
      'X-Organization-ID': 'acme',
      'X-Project-ID': 'billing',
    })
  })

  // A blank scope must become the explicit "all" marker rather than an empty
  // header. An empty X-Organization-ID is not the same request as an absent one,
  // and the service's own normalisation expects the marker.
  it('never sends an empty scope header', async () => {
    const { currentScopeHeaders, setScope, ALL } = await load()
    setScope({ organizationId: '', projectId: '' })
    expect(currentScopeHeaders()).toEqual({
      'X-Organization-ID': ALL,
      'X-Project-ID': ALL,
    })
  })
})

/**
 * The assertions above pin the header *builder*. This one pins the *wiring*,
 * because the bug lived there: `currentScopeHeaders` could stay perfectly correct
 * while the interceptor went back to reading captured state, and every test above
 * would still pass.
 *
 * Reading the source is blunt, and it is the only thing that actually holds here —
 * the failure is an effect-ordering race that a jsdom render would reproduce only
 * intermittently, if at all.
 */
describe('the interceptor wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./TenantContext.jsx', import.meta.url)),
    'utf8',
  )

  it('registers the scope interceptor exactly once, not per organisation', () => {
    const effect = source.slice(source.indexOf('axios.interceptors.request.use'))
    const deps = effect.slice(effect.indexOf('}, ['), effect.indexOf('}, [') + 8)
    expect(
      deps.startsWith('}, [])'),
      'the scope interceptor must have an empty dependency array — re-registering it '
      + 'when the organisation changes puts it one commit behind the provider, and '
      + 'requests go out scoped to the previous organisation',
    ).toBe(true)
  })

  it('builds the headers at request time rather than capturing them', () => {
    const body = source.slice(
      source.indexOf('axios.interceptors.request.use'),
      source.indexOf('return () => axios.interceptors.request.eject'),
    )
    expect(body).toContain('currentScopeHeaders()')
    // A captured `organizationId`/`projectId` inside the interceptor is the exact
    // shape of the original defect.
    expect(body).not.toMatch(/=\s*organizationId\b/)
    expect(body).not.toMatch(/=\s*projectId\b/)
  })
})
