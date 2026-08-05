/**
 * Resolve API base URL for OAM.
 * Empty env → same-origin (nginx path-proxies to oam-api).
 * Local Vite defaults to :8090.
 */
const OAM_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8090')

export function apiUrl(path = '') {
  if (!path) return OAM_URL
  return `${OAM_URL}${path}`
}

export const API_URLS = { OAM_URL }
