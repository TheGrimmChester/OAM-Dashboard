import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { apiUrl } from '../utils/apiBase'
import { useTenant } from '../contexts/TenantContext'

/**
 * One GET, with the three states a table needs kept distinct.
 *
 * `loading`, `error` and "loaded and genuinely empty" must never collapse into
 * one another. A credential list that renders "No credentials" while the request
 * is in flight — or after it failed — tells an operator their keys are gone.
 * That is the failure this hook exists to prevent, and why `data` starts as the
 * caller's fallback and is only replaced on success.
 *
 * Always re-fetches when the org/project switcher changes (`scopeKey`), so
 * single, multi, and All selections never leave stale rows on screen.
 */
export function useResource(path, { fallback = null, deps = [], skip = false } = {}) {
  const { scopeKey } = useTenant()
  const [data, setData] = useState(fallback)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (skip) {
      setLoading(false)
      return undefined
    }
    let active = true
    setLoading(true)
    setError(null)
    axios.get(apiUrl(path))
      .then((r) => { if (active) setData(r.data) })
      .catch((err) => { if (active) setError(describeError(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, skip, nonce, scopeKey, ...deps])

  return { data, loading, error, reload }
}

/**
 * A message an operator can act on.
 *
 * The service answers errors as `{error, message}` (Open-HTTP-Go's WriteError),
 * and that message is the useful half — "clickhouse not configured" or
 * "cannot set a binding for another user" beats "Request failed with status
 * code 500" every time. A bare axios string is the last resort, not the first.
 */
export function describeError(err) {
  const body = err?.response?.data
  const detail = body?.message || body?.error
  if (detail) return String(detail)
  if (err?.response?.status) return `HTTP ${err.response.status}`
  return String(err?.message || err)
}

/** POST, returning the parsed body or throwing a described error. */
export async function post(path, payload) {
  try {
    const r = await axios.post(apiUrl(path), payload)
    return r.data
  } catch (err) {
    throw new Error(describeError(err))
  }
}

/** The state a table is in, given a request and a row count. */
export function tableState({ loading, error, count }) {
  if (loading) return 'loading'
  if (error) return 'error'
  return count > 0 ? 'ready' : 'empty'
}
