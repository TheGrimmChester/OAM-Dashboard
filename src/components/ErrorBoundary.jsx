import React from 'react'
import { Banner, Button } from '@open-family/ui'

/**
 * A render error must not blank the console.
 *
 * This is the account and credential plane: an operator arriving because a job
 * failed `credential_unavailable` needs the page to say what broke, not to show
 * an empty document that looks like "nothing is configured".
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Console only: this is the client half of a config console, and shipping
    // stack traces to a server that stores secrets buys nothing.
    console.error('OAM console render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <Banner
          tone="danger"
          title="This page failed to render"
          actions={<Button size="sm" onClick={() => window.location.reload()}>Reload</Button>}
        >
          {String(this.state.error?.message || this.state.error)}
        </Banner>
      </div>
    )
  }
}
