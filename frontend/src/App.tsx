import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ConnectionsPage from './pages/ConnectionsPage'
import SQLLabPage from './pages/SQLLabPage'
import DatasetsPage from './pages/DatasetsPage'
import ChartsPage from './pages/ChartsPage'
import DashboardsPage from './pages/DashboardsPage'
import UsersPage from './pages/UsersPage'
import AuditLogsPage from './pages/AuditLogsPage'
import DashboardViewPage from './pages/DashboardViewPage'
import EmbedPage from './pages/EmbedPage'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type User = { id: number; username: string; role: 'admin' | 'analyst' | 'viewer' }

export type ApiFunction = (path: string, init?: RequestInit) => Promise<unknown>

export function useApi(token: string | null): ApiFunction {
  return async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    })
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      throw new Error(error?.detail ?? `Request failed (${response.status})`)
    }
    return response.status === 204 ? null : response.json()
  }
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) return
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(response => {
        if (!response.ok) throw new Error('Session expired')
        return response.json() as Promise<User>
      })
      .then(setUser)
      .catch(() => {
        sessionStorage.removeItem('token')
        setToken(null)
      })
  }, [token])

  async function logout() {
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch {}
    sessionStorage.removeItem('token')
    setToken(null)
    setUser(null)
    navigate('/login')
  }

  if (token && !user) {
    return (
      <main className="login-page">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </main>
    )
  }

  if (!token || !user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setToken} />} />
        <Route path="/embed/:shareToken" element={<EmbedPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="brand-mark" aria-hidden="true">D</div>
          <span className="eyebrow">DATA EXPLORATION</span>
        </div>
        <nav className="main-nav">
          <Link to="/sql-lab">SQL Lab</Link>
          {user.role !== 'viewer' && <Link to="/datasets">Datasets</Link>}
          {user.role !== 'viewer' && <Link to="/charts">Charts</Link>}
          <Link to="/dashboards">Dashboards</Link>
          {user.role === 'admin' && <Link to="/connections">Connections</Link>}
          {user.role === 'admin' && <Link to="/users">Users</Link>}
          {user.role === 'admin' && <Link to="/audit">Audit</Link>}
        </nav>
        <div className="account">
          <span>{user.username} · {user.role === 'admin' ? 'Admin' : user.role === 'analyst' ? 'Analyst' : 'Viewer'}</span>
          <button className="secondary" onClick={logout}>Đăng xuất</button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboards" replace />} />
        <Route path="/sql-lab" element={<SQLLabPage token={token} user={user} />} />
        <Route path="/datasets" element={user.role !== 'viewer' ? <DatasetsPage token={token} user={user} /> : <Navigate to="/dashboards" replace />} />
        <Route path="/charts" element={user.role !== 'viewer' ? <ChartsPage token={token} user={user} /> : <Navigate to="/dashboards" replace />} />
        <Route path="/dashboards" element={<DashboardsPage token={token} user={user} />} />
        <Route path="/dashboards/:id" element={<DashboardViewPage token={token} user={user} />} />
        <Route path="/connections" element={user.role === 'admin' ? <ConnectionsPage token={token} /> : <Navigate to="/dashboards" replace />} />
        <Route path="/users" element={user.role === 'admin' ? <UsersPage token={token} /> : <Navigate to="/dashboards" replace />} />
        <Route path="/audit" element={user.role === 'admin' ? <AuditLogsPage token={token} /> : <Navigate to="/dashboards" replace />} />
        <Route path="/embed/:shareToken" element={<EmbedPage />} />
        <Route path="*" element={<Navigate to="/dashboards" replace />} />
      </Routes>
    </>
  )
}
