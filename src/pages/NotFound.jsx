import React from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Stack, EmptyState, Button } from '@open-family/ui'
import { FiCompass } from 'react-icons/fi'

export default function NotFound() {
  return (
    <Stack gap="sections">
      <PageHeader title="Not found" />
      <Card>
        <EmptyState
          icon={<FiCompass />}
          title="There is no page at this address"
          description="The link may be from an older build, or the path may be a typo."
          actions={<Button href="/overview" variant="primary">Go to the overview</Button>}
        />
        <p className="oam-source-detail">
          Looking for something specific? <Link to="/agents">Agents &amp; Models</Link>,{' '}
          <Link to="/endpoints">AI Endpoints</Link>, <Link to="/users">Users</Link>.
        </p>
      </Card>
    </Stack>
  )
}
