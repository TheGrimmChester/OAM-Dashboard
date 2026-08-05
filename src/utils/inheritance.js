/**
 * The inherited-value model for `Agents & Models`.
 *
 * OAM resolves a binding through five layers — task override, user, org,
 * product default (`agent_key = "*"`), family default — and returns the winner
 * with a `source` naming the layer. This module turns that one string into what
 * the page needs to render honestly:
 *
 *   - whether the value shown is *this row's own* setting or inherited
 *   - which layer it came from, in words a person can act on
 *   - whether "Reset to inherited" is even a meaningful action
 *
 * Pure on purpose: no React, no axios. The distinction between "configured here"
 * and "inherited" is the whole point of the page, and a UI that gets it backwards
 * tells an operator they have set something they have not. That is testable
 * without a DOM, so it is tested without one.
 *
 * The source strings are OAM's, from `bindingSource*` in agent_models.go. They
 * are a wire contract: if OAM adds a layer, `describeSource` must learn it, and
 * `UNKNOWN_SOURCE` makes that visible instead of rendering a blank cell.
 */

export const SOURCE_TASK_OVERRIDE = 'task_override'
export const SOURCE_USER = 'user'
export const SOURCE_ORG = 'org'
export const SOURCE_PRODUCT_DEFAULT = 'product_default'
export const SOURCE_FAMILY_DEFAULT = 'family_default'

/** Most specific first — the order OAM resolves in. */
export const SOURCE_ORDER = [
  SOURCE_TASK_OVERRIDE,
  SOURCE_USER,
  SOURCE_ORG,
  SOURCE_PRODUCT_DEFAULT,
  SOURCE_FAMILY_DEFAULT,
]

export const UNKNOWN_SOURCE = {
  id: 'unknown',
  label: 'Unrecognised layer',
  detail:
    'OAM reported a resolution layer this console does not know. It is probably newer than this build — ' +
    'the value is still what will run.',
  inherited: true,
  tone: 'warning',
}

const SOURCES = {
  [SOURCE_TASK_OVERRIDE]: {
    id: SOURCE_TASK_OVERRIDE,
    label: 'Set on this task',
    detail: 'A one-off override passed when the job was enqueued. It outranks every stored binding.',
    inherited: false,
    tone: 'accent',
  },
  [SOURCE_USER]: {
    id: SOURCE_USER,
    label: 'Your override',
    detail: 'Your personal binding for this agent. It applies to jobs you run, and to nobody else.',
    inherited: false,
    tone: 'accent',
  },
  [SOURCE_ORG]: {
    id: SOURCE_ORG,
    label: 'Organisation',
    detail: 'Configured for this agent at the organisation level, for everyone without a personal override.',
    inherited: false,
    tone: 'info',
  },
  [SOURCE_PRODUCT_DEFAULT]: {
    id: SOURCE_PRODUCT_DEFAULT,
    label: 'Inherited — product default',
    detail:
      'This agent has no binding of its own. The value comes from the organisation’s catch-all binding ' +
      'for the whole product.',
    inherited: true,
    tone: 'neutral',
  },
  [SOURCE_FAMILY_DEFAULT]: {
    id: SOURCE_FAMILY_DEFAULT,
    label: 'Inherited — family default',
    detail:
      'Nothing is configured at any level, so the built-in family default applies. Setting anything here ' +
      'takes precedence immediately.',
    inherited: true,
    tone: 'neutral',
  },
}

/** Look up a source. An unknown string is reported, never silently blanked. */
export function describeSource(source) {
  const key = String(source || '').trim().toLowerCase()
  return SOURCES[key] || UNKNOWN_SOURCE
}

/**
 * True when the effective value is inherited rather than set at the level the
 * console is currently editing.
 *
 * Note this is *relative to the editing scope*, which is why it is not simply
 * `describeSource(...).inherited`. An admin editing org config looks at a row
 * whose value came from `org` and is looking at their own setting; the same row
 * seen by a user deciding whether to set a personal override is inherited from
 * above them. Getting this wrong puts "Reset to inherited" on a row that has
 * nothing to reset.
 */
export function isInheritedFor(source, editingScope) {
  const src = describeSource(source).id
  if (src === UNKNOWN_SOURCE.id) return true
  const scope = String(editingScope || '').trim().toLowerCase()
  if (scope === 'user') return src !== SOURCE_USER && src !== SOURCE_TASK_OVERRIDE
  if (scope === 'org') return src !== SOURCE_ORG && src !== SOURCE_USER && src !== SOURCE_TASK_OVERRIDE
  // An unrecognised editing scope must not claim the value is locally owned.
  return true
}

/**
 * One row of the Agents & Models table, assembled from the catalog entry and the
 * effective binding.
 *
 * The catalog is authoritative for *which agents exist* — that is the point of
 * products publishing it — so a row is produced for every catalog entry even
 * when no binding has ever been stored for it. An agent missing from the table
 * would be an agent nobody knows they can configure.
 */
export function buildAgentRow(catalogEntry, effective, editingScope) {
  const source = effective?.source
  const info = describeSource(source)
  const provider = effective?.provider || ''
  const model = effective?.model || ''
  return {
    product: catalogEntry?.product || '',
    agentKey: catalogEntry?.agent_key || '',
    label: catalogEntry?.label || catalogEntry?.agent_key || '',
    tierHint: catalogEntry?.tier_hint || '',
    aiBacked: catalogEntry?.ai_backed !== false,
    provider,
    model,
    baseUrl: effective?.base_url || '',
    fallbackModel: effective?.fallback_model || '',
    source: info.id,
    sourceLabel: info.label,
    sourceDetail: info.detail,
    sourceTone: info.tone,
    inherited: isInheritedFor(source, editingScope),
    // Nothing resolved at all: the API answered but with neither provider nor
    // model. Rendering an empty row as though it were configured is how "why did
    // my job fail closed" becomes unanswerable from the console.
    unresolved: !provider && !model,
  }
}

/** Group rows by product for the page's per-product sections. */
export function groupByProduct(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.product || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()]
    .map(([product, items]) => ({ product, rows: items }))
    .sort((a, b) => a.product.localeCompare(b.product))
}

/**
 * A short human summary of what a binding will do, for the row's collapsed state.
 * `auto` is spelled out because it is a real, deliberate value in this family —
 * Cursor's automatic model selection — and reads like a missing setting otherwise.
 */
export function summarizeBinding({ provider, model }) {
  const p = String(provider || '').trim()
  const m = String(model || '').trim()
  if (!p && !m) return 'Not resolved'
  if (m === 'auto') return `${p || 'provider'} · automatic model choice`
  if (!m) return p
  if (!p) return m
  return `${p} · ${m}`
}
