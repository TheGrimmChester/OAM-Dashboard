import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiGitBranch } from 'react-icons/fi'
import { Banner, Button, PageHeader, Stack, useToast } from '@open-family/ui'
import ConnectorsManager from '../components/connectors/ConnectorsManager'

const FLASH_TONE = { ok: 'good', warn: 'warning', error: 'critical' }

function claimTokenFromLocation(searchParams) {
  const fromQuery = searchParams.get('claim_token') || ''
  if (fromQuery) return fromQuery
  const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
  if (!hash) return ''
  return new URLSearchParams(hash).get('claim_token') || ''
}

/**
 * SCM connectors — the family console for GitHub App / PAT installations.
 *
 * Provider keys and AI endpoint failover live on Credentials and AI Endpoints.
 * Orphan App installs claim via `?connector=` + `#claim_token=` deep-link only.
 */
export default function Connectors() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const [banner, setBanner] = useState(null)
  const editId = searchParams.get('edit') || ''
  const claimConnectorId = searchParams.get('connector') || ''
  const claimToken = useMemo(() => claimTokenFromLocation(searchParams), [searchParams])
  const role = localStorage.getItem('role') || ''
  const isAdmin = role === 'admin' || role === ''
  const defaultScope = isAdmin ? 'org' : 'user'

  const onFlash = (tone, title, detail) => {
    setBanner({ tone, title, detail })
    toast.push({ title, tone: tone === 'error' ? 'critical' : 'accent' })
  }

  const clearClaimParams = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('claim_token')
    next.delete('connector')
    setSearchParams(next, { replace: true })
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <Stack gap="sections">
      <PageHeader
        title={<><FiGitBranch /> Connectors</>}
        description={(
          <>
            SCM connections (GitHub App or PAT + repo hooks) scoped to an organisation and project.
            Events fan out from Open Review Agent to compatible family checkers (review, AppSec, perf, delivery).
            AI provider keys live under{' '}
            <Link to="/credentials">Credentials</Link>
            {' '}and{' '}
            <Link to="/endpoints">AI Endpoints</Link>.
          </>
        )}
      />

      {banner && (
        <Banner
          tone={FLASH_TONE[banner.tone] || 'accent'}
          title={banner.title}
          actions={<Button size="sm" variant="ghost" onClick={() => setBanner(null)}>Dismiss</Button>}
        >
          {banner.detail
            ? (typeof banner.detail === 'string' ? banner.detail : JSON.stringify(banner.detail))
            : null}
        </Banner>
      )}

      <ConnectorsManager
        initialEditId={editId}
        claimConnectorId={claimConnectorId}
        claimToken={claimToken}
        onClaimParamsConsumed={clearClaimParams}
        onFlash={onFlash}
        defaultScope={defaultScope}
      />
    </Stack>
  )
}
