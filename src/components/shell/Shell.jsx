import React, { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiRefreshCw, FiSun, FiMoon, FiUser, FiLogOut } from 'react-icons/fi'
import axios from 'axios'
import {
  AppShell, PageContent, Sidebar, TopBar, TopBarDivider,
  OrgSwitcher, UserMenu, MenuHeader, MenuItem, MenuLabel, MenuSeparator,
  Button, ToastProvider, useSidebarCollapsed, useTheme, productTitle,
} from '@open-family/ui'
import { NAV_SECTIONS, OVERVIEW_ITEM, pageTitleForPath } from '../../nav'
import { navIcon } from '../../icons'
import { useTenant, ALL } from '../../contexts/TenantContext'
import { apiUrl } from '../../utils/apiBase'

const PRODUCT_NAME = 'Open Account Manager'

/** Two-letter mark for the avatar. */
function initialsFor(name) {
  const clean = String(name || '').trim()
  if (!clean) return 'OA'
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/**
 * The scope switcher. Unlike the peer consoles this is not a view filter — it
 * decides which organisation's credentials and bindings you are editing — so the
 * "all" option is labelled as the default target rather than as a wildcard.
 */
function TenantSwitcher() {
  const {
    organizationId, projectId, organizations, projects, selectOrganization, selectProject,
    isPersonalAccount: personal, orgLocked,
  } = useTenant()

  if (personal) return null

  const org = organizations.find((o) => o.id === organizationId)
  const project = projects.find((p) => p.id === projectId)

  const orgLabel = organizationId === ALL ? 'Default organisation' : (org?.name || organizationId)
  const projectLabel = projectId === ALL ? 'All projects' : (project?.name || projectId)

  const uniqueOrgs = organizations.filter(
    (o, i, self) => i === self.findIndex((x) => x.id === o.id),
  )

  return (
    <OrgSwitcher contextLabel={orgLabel} value={projectLabel} initials={initialsFor(orgLabel)}>
      {!orgLocked ? (
        <>
          <MenuLabel>Organisation</MenuLabel>
          <MenuItem checked={organizationId === ALL} onSelect={() => selectOrganization(ALL)}>
            Default organisation
          </MenuItem>
          {uniqueOrgs.map((o) => (
            <MenuItem
              key={o.id}
              checked={o.id === organizationId}
              onSelect={() => selectOrganization(o.id)}
            >
              {o.name || o.id}
            </MenuItem>
          ))}
          <MenuSeparator />
        </>
      ) : null}
      <MenuLabel>Project</MenuLabel>
      <MenuItem checked={projectId === ALL} onSelect={() => selectProject(ALL)}>
        All projects
      </MenuItem>
      {projects.map((p) => (
        <MenuItem
          key={p.id}
          checked={p.id === projectId}
          onSelect={() => selectProject(p.id)}
        >
          {p.name || p.id}
        </MenuItem>
      ))}
    </OrgSwitcher>
  )
}

export default function Shell({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { refresh } = useTenant()
  const [collapsed, toggleCollapsed] = useSidebarCollapsed('oam_rail_collapsed')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { theme, setTheme, toggle: toggleTheme, resolved } = useTheme('oam_theme')

  const username = localStorage.getItem('username') || ''
  const role = localStorage.getItem('role') || ''
  const isAdmin = role.toLowerCase() === 'admin'

  // The browser tab names the page, not the product.
  useEffect(() => {
    document.title = productTitle({ productName: PRODUCT_NAME, page: pageTitleForPath(pathname) })
  }, [pathname])

  const go = useCallback((to) => {
    navigate(to)
    setDrawerOpen(false)
  }, [navigate])

  const signOut = async () => {
    try { await axios.post(apiUrl('/api/auth/logout')) } catch { /* clear locally regardless */ }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    localStorage.removeItem('account_type')
    window.location.assign('/login')
  }

  const sections = NAV_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    items: section.items.map((item) => ({
      to: item.to,
      label: item.label,
      icon: navIcon(item.icon),
    })),
  }))

  return (
    <ToastProvider>
      <AppShell
        sidebarOpen={drawerOpen}
        onCloseSidebar={() => setDrawerOpen(false)}
        sidebar={
          <Sidebar
            productCode="OAM"
            productName={PRODUCT_NAME}
            homeHref="/overview"
            overview={{
              to: OVERVIEW_ITEM.to,
              label: OVERVIEW_ITEM.label,
              icon: navIcon(OVERVIEW_ITEM.icon),
              exact: OVERVIEW_ITEM.exact,
            }}
            sections={sections}
            pathname={pathname}
            onNavigate={go}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={drawerOpen}
            isAdmin={isAdmin}
          />
        }
        topBar={
          <TopBar
            onOpenSidebar={() => setDrawerOpen(true)}
            left={<TenantSwitcher />}
            right={
              <>
                <Button variant="ghost" aria-label="Refresh data" icon={<FiRefreshCw />} onClick={refresh} />
                <Button
                  variant="ghost"
                  aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
                  icon={resolved === 'dark' ? <FiSun /> : <FiMoon />}
                  onClick={toggleTheme}
                />
                <TopBarDivider />
                <UserMenu initials={initialsFor(username || 'OAM')}>
                  <MenuHeader>{username || 'Signed out'}{role ? ` · ${role}` : ''}</MenuHeader>
                  <MenuItem icon={<FiUser />} onSelect={() => go('/settings/account')}>Account</MenuItem>
                  <MenuSeparator />
                  <MenuLabel>Appearance</MenuLabel>
                  <MenuItem checked={theme === 'light'} onSelect={() => setTheme('light')}>Light</MenuItem>
                  <MenuItem checked={theme === 'dark'} onSelect={() => setTheme('dark')}>Dark</MenuItem>
                  <MenuItem checked={theme === 'system'} onSelect={() => setTheme('system')}>Match system</MenuItem>
                  {username ? (
                    <>
                      <MenuSeparator />
                      <MenuItem icon={<FiLogOut />} danger onSelect={signOut}>Sign out</MenuItem>
                    </>
                  ) : null}
                </UserMenu>
              </>
            }
          />
        }
      >
        <PageContent>{children}</PageContent>
      </AppShell>
    </ToastProvider>
  )
}
