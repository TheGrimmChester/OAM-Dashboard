import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiGitBranch } from 'react-icons/fi'
import { Banner, Button, PageHeader, Stack, useToast } from '@open-family/ui'
import ConnectorsManager from '../components/connectors/ConnectorsManager'

const FLASH_TONE = { ok: 'good', warn: 'warning', error: 'critical' }

/**
 * SCM connectors — the family console for GitHub App / PAT installations.
 *
 * Provider keys and AI endpoint failover live on Credentials and AI Endpoints.
 */
export default function Connectors() {
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const [banner, setBanner] = useState(null)
  const editId = searchParams.get('edit') || ''
  const role = localStorage.getItem('role') || ''
  const isAdmin = role === 'admin' || role === ''
  const defaultScope = isAdmin ? 'org' : 'user'

  const onFlash = (tone, title, detail) => {
    setBanner({ tone, title, detail })
    toast.push({ title, tone: tone === 'error' ? 'critical' : 'accent' })
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

      <ConnectorsManager initialEditId={editId} onFlash={onFlash} defaultScope={defaultScope} />
    </Stack>
  )
}
