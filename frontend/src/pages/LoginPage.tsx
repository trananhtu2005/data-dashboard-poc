import { FormEvent, useState } from 'react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
      })
      if (!response.ok) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.')
      const data = await response.json() as { access_token: string }
      sessionStorage.setItem('token', data.access_token)
      onLogin(data.access_token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">D</div>
        <p className="eyebrow">DATA EXPLORATION</p>
        <h1 id="login-title">Chào mừng trở lại</h1>
        <p className="muted">Đăng nhập để tiếp tục đến không gian dữ liệu của bạn.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Tên đăng nhập</label>
          <input
            id="username"
            autoComplete="username"
            required
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="footnote">Truy cập được quản lý bởi quản trị viên hệ thống.</p>
      </section>
    </main>
  )
}
