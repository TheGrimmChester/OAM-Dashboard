import React from 'react'
import { Banner } from '@open-family/ui'

/**
 * Soft hint when the switcher is multi-select on surfaces that still write
 * org/user-global (no X-Project-ID) the same way as All projects.
 *
 * All projects is a valid write scope for OAM configuration — do not block.
 * Pass `block={false}` (default) for Endpoints / Agents / Connectors.
 */
export default function ProjectWriteBanner({ hasConcreteProject, selectionIsMulti = false }) {
  if (hasConcreteProject) return null
  if (!selectionIsMulti) return null
  return (
    <Banner tone="info" title="Multi-select writes org-wide config">
      With more than one project checked, creates and updates omit a single project
      and land as organisation / user global config (same as All projects). Pick one
      project for a project-scoped override.
    </Banner>
  )
}
