import { FormEvent, useState, useEffect } from 'react'
import { useApi } from '../App'

type User = { id: number; username: string; role: 'admin' | 'analyst' | 'viewer' }

export default function UsersPage({ token }: { token: string }) {
  const api = useApi(token)
  const [users, setUsers] = useState<User[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'analyst' | 'viewer'>('viewer')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { void loadUsers() }, [])

  async function loadUsers() {
    try {
      setUsers(await api('/auth/users') as User[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được người dùng.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      await api('/auth/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role })
      })
      setUsername('')
      setPassword('')
      await loadUsers()
      setNotice('Đã tạo người dùng.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được người dùng.')
    }
  }

  async function deleteUser(id: number) {
    if (!window.confirm('Xóa người dùng này?')) return
    try {
      await api(`/auth/users/${id}`, { method: 'DELETE' })
      await loadUsers()
      setNotice('Đã xóa người dùng.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được người dùng.')
    }
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">QUẢN TRỊ</p>
        <h1>Quản lý người dùng</h1>
        <p className="muted">Tạo và quản lý tài khoản Admin, Analyst và Viewer.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form className="connection-form" onSubmit={handleSubmit}>
          <h2>Tạo người dùng mới</h2>
          <label htmlFor="new-user">Tên đăng nhập</label>
          <input
            id="new-user"
            required
            minLength={3}
            value={username}
            onChange={e => setUsername(e.target.value)}
          />

          <label htmlFor="new-password">Mật khẩu (ít nhất 12 ký tự)</label>
          <input
            id="new-password"
            type="password"
            minLength={12}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <label htmlFor="new-role">Vai trò</label>
          <select
            id="new-role"
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'analyst' | 'viewer')}
          >
            <option value="viewer">Viewer (chỉ xem)</option>
            <option value="analyst">Analyst (tạo dataset/chart/dashboard)</option>
            <option value="admin">Admin (toàn quyền)</option>
          </select>

          <button type="submit">Tạo người dùng</button>
        </form>

        <section className="connection-list">
          <h2>Người dùng hiện có</h2>
          {users.map(user => (
            <article className="connection" key={user.id}>
              <div>
                <strong>{user.username}</strong>
                <p className="hint">{user.role}</p>
              </div>
              <button className="danger" onClick={() => void deleteUser(user.id)}>Xóa</button>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
