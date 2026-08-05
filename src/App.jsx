import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { Spinner } from '@open-family/ui'
import ErrorBoundary from './components/ErrorBoundary'
import Shell from './components/shell/Shell'
import { TenantProvider } from './contexts/TenantContext'
import { apiUrl } from './utils/apiBase'

const Overview = lazy(() => import('./pages/Overview'))
const Organizations = lazy(() => import('./pages/Organizations'))
const Projects = lazy(() => import('./pages/Projects'))
const Users = lazy(() => import('./pages/Users'))
const AgentsModels = lazy(() => import('./pages/AgentsModels'))
const Endpoints = lazy(() => import('./pages/Endpoints'))
const Credentials = lazy(() => import('./pages/Credentials'))
const Audit = lazy(() => import('./pages/Audit'))
const Account = lazy(() => import('./pages/Account'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Login = lazy(() => import('./pages/Login'))

let authProbe = null

function RouteFallback() {
  return (
    <div className="oam-route-loading">
      <Spinner label="Loading this page" />
    </div>
  )
}

function RequireAuth({ children }) {
  const [allowed, setAllowed] = useState(() => !!localStorage.getItem('auth_token'))

  useEffect(() => {
    if (allowed) return undefined
    if (!authProbe) {
      // A 401/403 means sign in; anything else (including a service with auth
      // switched off, or a network hiccup) must not lock an operator out of the
      // console that configures the credentials.
      authProbe = axios
        .get(apiUrl('/api/auth/status'))
        .then(() => true)
        .catch((err) => {
          const status = err?.response?.status
          return status !== 401 && status !== 403
        })
    }
    let active = true
    authProbe.then((ok) => {
      if (!active) return
      if (ok) {
        setAllowed(true)
      } else {
        const back = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.assign(`/login?next=${back}`)
      }
    })
    return () => { active = false }
  }, [allowed])

  if (!allowed) return null
  return children
}

function App() {
  const { pathname } = useLocation()

  // Login renders outside the shell, and is the reason there is no /login route
  // in the table below — a second declaration would be dead.
  if (pathname === '/login') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Login />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <RequireAuth>
        <TenantProvider>
          <Shell>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<Overview />} />
                <Route path="/organizations" element={<Organizations />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/users" element={<Users />} />
                <Route path="/agents" element={<AgentsModels />} />
                <Route path="/endpoints" element={<Endpoints />} />
                <Route path="/credentials" element={<Credentials />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/settings/account" element={<Account />} />

                {/* Without a catch-all an unknown URL renders a blank column. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Shell>
        </TenantProvider>
      </RequireAuth>
    </ErrorBoundary>
  )
}

export default App
