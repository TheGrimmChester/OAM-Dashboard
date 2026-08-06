import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { FiEye } from 'react-icons/fi'
import {
  Badge, Button, Card, CellStack, EmptyState, Field, Grid, Input, Stack, Table,
} from '@open-family/ui'
import { apiUrl } from '../../utils/apiBase'
import { checkerPreviewLabels, defaultChecksForRepo } from '../../lib/scmCheckers'

/**
 * Watched repos for a connector — proxied to ORA when available.
 * Shows checker preview (which family products receive SCM events).
 */
export default function WatchedReposPanel({ connectorId, connector, onFlash, readOnly = false }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [watched, setWatched] = useState([])
  const [repoInput, setRepoInput] = useState('')
  const [checks, setChecks] = useState(defaultChecksForRepo())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!connectorId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get(apiUrl(`/api/connectors/${encodeURIComponent(connectorId)}/watched`))
      setWatched(data?.watched || data?.repos || [])
    } catch (e) {
      if (e.response?.status === 404) {
        setWatched([])
        setError(null)
      } else {
        setError(e.response?.data || e.message)
        setWatched([])
      }
    } finally {
      setLoading(false)
    }
  }, [connectorId])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async () => {
    if (readOnly || !connectorId) return
    const repo = String(repoInput || '').trim()
    if (!repo.includes('/')) {
      onFlash?.('warn', 'Invalid repo', 'Use owner/name format')
      return
    }
    setBusy(true)
    try {
      const next = [
        ...watched.filter((w) => (w.repo_full_name || w.repo) !== repo),
        { repo_full_name: repo, enabled: true, checks_json: checks },
      ]
      await axios.put(apiUrl(`/api/connectors/${encodeURIComponent(connectorId)}/watched`), {
        watched: next,
      })
      setRepoInput('')
      await load()
      onFlash?.('ok', 'Watch registered', repo)
    } catch (e) {
      onFlash?.('error', 'Watch update failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const preview = checkerPreviewLabels(checks)
  const mode = connector?.webhook_mode || 'app'

  return (
    <Card
      title={<><FiEye /> Watched repositories</>}
      description={(
        <>
          Events for enabled repos fan out to family checkers below. Ingress:{' '}
          <Badge tone={mode === 'repo' ? 'warning' : 'good'}>
            {mode === 'repo' ? 'PAT + repo hooks' : 'GitHub App'}
          </Badge>
        </>
      )}
      actions={(
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => load?.()}>
          Refresh
        </Button>
      )}
      flush
    >
      <Stack gap="md">
        <div>
          <p className="oui-muted oui-text-sm" style={{ marginBottom: '0.5rem' }}>
            Checker preview — products that receive SCM events for this org:
          </p>
          <div className="oui-row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
            {preview.map((c) => (
              <Badge key={c.key} title={c.description}>
                {c.product}: {c.label}
              </Badge>
            ))}
          </div>
        </div>

        {!readOnly && (
          <Grid columns={2}>
            <Field label="Repository" htmlFor="watch-repo" hint="owner/name">
              <Input
                id="watch-repo"
                className="oui-mono"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="acme/app"
              />
            </Field>
            <Field label="Checks (JSON array)" htmlFor="watch-checks" hint="Default: ora:review + osa:dependencies">
              <Input
                id="watch-checks"
                className="oui-mono"
                value={JSON.stringify(checks)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    if (Array.isArray(parsed)) setChecks(parsed)
                  } catch { /* typing */ }
                }}
              />
            </Field>
          </Grid>
        )}

        {!readOnly && (
          <div className="oui-row">
            <Button variant="primary" disabled={busy || !repoInput} onClick={handleAdd}>
              Register repo watch
            </Button>
          </div>
        )}

        <Table
          aria-label="Watched repositories"
          state={loading ? 'loading' : error ? 'error' : watched.length ? 'ready' : 'empty'}
          columns={[
            {
              key: 'repo',
              header: 'Repository',
              render: (w) => (
                <CellStack
                  primary={w.repo_full_name || w.repo || '—'}
                  secondary={w.enabled === false ? 'disabled' : 'enabled'}
                />
              ),
            },
            {
              key: 'checks',
              header: 'Checkers',
              render: (w) => {
                const labels = checkerPreviewLabels(w.checks_json || w.checks)
                return (
                  <span className="oui-row" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
                    {labels.map((c) => <Badge key={c.key}>{c.product}</Badge>)}
                  </span>
                )
              },
            },
          ]}
          rows={watched}
          getRowKey={(w) => w.repo_full_name || w.repo || w.id}
          emptyState={(
            <EmptyState
              inline
              title="No watched repos"
              description="Register a repository to receive pull_request and push events via ORA."
            />
          )}
          errorState={(
            <EmptyState
              inline
              title="Watched repos unavailable"
              description={typeof error === 'string' ? error : JSON.stringify(error)}
            />
          )}
        />
      </Stack>
    </Card>
  )
}
