import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiGitBranch } from 'react-icons/fi'
import { Banner, Button, PageHeader, Stack, useToast } from '@open-family/ui'
import ConnectorsManager from '../components/connectors/ConnectorsManager'
import ProjectWriteBanner from '../components/ProjectWriteBanner'
import { useTenant } from '../contexts/TenantContext'

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
 * Provider keys and AI endpoint failover live on AI Endpoints.
 * Orphan App installs claim via `?connector=` + `#claim_token=` deep-link only.
 */
export default function Connectors() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { hasConcreteProject, selectionIsMulti, isPersonalAccount } = useTenant()
  const [banner, setBanner] = useState(null)
  const editId = searchParams.get('edit') || ''
  const claimConnectorId = searchParams.get('connector') || ''
  const claimToken = useMemo(() => claimTokenFromLocation(searchParams), [searchParams])
  // Org accounts manage org-scoped connectors; personal accounts manage user-scoped.
  // Admin is overview-only — not required for Connect / claim / edit.
  const defaultScope = isPersonalAccount ? 'user' : 'org'

  const onFlash = (tone, title, detail) => {
    const detailText = detail == null
      ? ''
      : (typeof detail === 'string' ? detail : JSON.stringify(detail))
    setBanner({ tone, title, detail: detailText })
    toast.push({
      title,
      description: detailText || undefined,
      tone: FLASH_TONE[tone] || (tone === 'error' ? 'critical' : 'accent'),
    })
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
            SCM connections (GitHub App or PAT + repo hooks) for your Open account —
            organization tenants share org-scoped installs; personal accounts own installs under your user.
            Events fan out from Open Review Agent to compatible family checkers (review, AppSec, perf, delivery).
            AI provider keys live under{' '}
            <Link to="/endpoints">AI Endpoints</Link>.
          </>
        )}
      />

      <ProjectWriteBanner
        hasConcreteProject={hasConcreteProject}
        selectionIsMulti={selectionIsMulti}
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
