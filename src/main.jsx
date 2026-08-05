import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import axios from 'axios'
import App from './App'
import '@open-family/ui/styles.css'
import { applyProduct, initTheme, productTitle } from '@open-family/ui'
import './index.css'

// Stamp product and theme before React renders, so the first paint is already
// bronze and already in the right theme. `applyProduct` binds --accent and its
// six sibling steps; `initTheme` reads the stored choice and applies it.
applyProduct('oam')
initTheme('oam_theme')

// Placeholder until the first route resolves; every route sets its own title.
document.title = productTitle({ productName: 'Open Account Manager' })

axios.interceptors.request.use((config) => {
  const url = config.url || ''
  let attach = false
  if (!/^https?:\/\//i.test(url)) {
    attach = true
  } else {
    try {
      const host = new URL(url).hostname
      attach = host === 'localhost' || host === '127.0.0.1' || host === window.location.hostname
    } catch {
      attach = false
    }
  }
  if (attach) {
    config.headers = config.headers || {}
    const token = localStorage.getItem('auth_token')
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const username = localStorage.getItem('username')
    const role = localStorage.getItem('role')
    if (username && !config.headers['X-User-Username']) {
      config.headers['X-User-Username'] = username
    }
    if (role && !config.headers['X-User-Role']) {
      config.headers['X-User-Role'] = role
    }
  }
  return config
})

axios.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    const onAuthPath = window.location.pathname === '/login' || /\/api\/auth\//.test(url)
    if (status === 401 && !onAuthPath) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
      const back = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.assign(`/login?next=${back}`)
    }
    return Promise.reject(error)
  },
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
