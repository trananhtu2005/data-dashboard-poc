import { FormEvent, useState, useEffect } from 'react'
import { useApi } from '../App'

type Connection = { id: number; name: string; db_type: string; status: string }
type TableInfo = { schema: string; table: string; columns: { name: string; type: string }[] }

export default function ConnectionsPage({ token }: { token: string }) {
  const api = useApi(token)
  const [connections, setConnections] = useState<Connection[]>([])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [name, setName] = useState('')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5432')
  const [database, setDatabase] = useState('')
  const [dbUser, setDbUser] = useState('')
  const [dbPassword, setDbPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { void loadConnections() }, [])

  async function loadConnections() {
    try {
      setConnections(await api('/connections') as Connection[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được kết nối.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    const uri = `postgresql+psycopg://${dbUser}:${dbPassword}@${host}:${port}/${database}`
    try {
      await api('/connections', { method: 'POST', body: JSON.stringify({ name, uri }) })
      setName('')
      setHost('localhost')
      setPort('5432')
      setDatabase('')
      setDbUser('')
      setDbPassword('')
      await loadConnections()
      setNotice('Đã lưu kết nối.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được kết nối.')
    }
  }

  async function testConnection(id: number) {
    setError('')
    setNotice('')
    try {
      const result = await api(`/connections/${id}/test`, { method: 'POST' }) as { status: string }
      setNotice(`Kiểm tra kết nối: ${result.status}`)
      await loadConnections()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kiểm tra kết nối thất bại.')
    }
  }

  async function loadSchema(id: number) {
    setError('')
    try {
      setTables(await api(`/connections/${id}/schema`) as TableInfo[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được schema.')
    }
  }

  async function removeConnection(id: number) {
    if (!window.confirm('Xóa kết nối này?')) return
    setError('')
    try {
      await api(`/connections/${id}`, { method: 'DELETE' })
      await loadConnections()
      setTables([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được kết nối.')
    }
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">NỀN TẢNG</p>
        <h1>Kết nối dữ liệu</h1>
        <p className="muted">Quản lý nguồn PostgreSQL và kiểm tra schema trước khi khám phá dữ liệu.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form className="connection-form" onSubmit={handleSubmit}>
          <h2>Thêm kết nối PostgreSQL</h2>
          <label htmlFor="conn-name">Tên hiển thị</label>
          <input id="conn-name" required maxLength={150} value={name} onChange={e => setName(e.target.value)} />

          <label htmlFor="conn-host">Host</label>
          <input id="conn-host" required value={host} onChange={e => setHost(e.target.value)} />

          <label htmlFor="conn-port">Port</label>
          <input id="conn-port" required value={port} onChange={e => setPort(e.target.value)} />

          <label htmlFor="conn-database">Database</label>
          <input id="conn-database" required value={database} onChange={e => setDatabase(e.target.value)} />

          <label htmlFor="conn-user">Username</label>
          <input id="conn-user" required value={dbUser} onChange={e => setDbUser(e.target.value)} />

          <label htmlFor="conn-password">Password</label>
          <input id="conn-password" type="password" autoComplete="new-password" required value={dbPassword} onChange={e => setDbPassword(e.target.value)} />

          <p className="hint">Mật khẩu được mã hóa khi lưu. Dùng tài khoản nguồn chỉ đọc.</p>
          <button type="submit">Lưu kết nối</button>
        </form>

        <section className="connection-list">
          <h2>Kết nối đã lưu</h2>
          {connections.length === 0 ? (
            <p className="muted">Chưa có kết nối nào.</p>
          ) : (
            connections.map(connection => (
              <article className="connection" key={connection.id}>
                <div>
                  <strong>{connection.name}</strong>
                  <p className="hint">PostgreSQL · {connection.status}</p>
                </div>
                <div className="actions">
                  <button className="secondary" onClick={() => void testConnection(connection.id)}>Kiểm tra</button>
                  <button className="secondary" onClick={() => void loadSchema(connection.id)}>Xem schema</button>
                  <button className="danger" onClick={() => void removeConnection(connection.id)}>Xóa</button>
                </div>
              </article>
            ))
          )}
        </section>

        {tables.length > 0 && (
          <section className="connection-list">
            <h2>Bảng và cột</h2>
            {tables.map(item => (
              <article className="table-info" key={`${item.schema}.${item.table}`}>
                <strong>{item.schema}.{item.table}</strong>
                <p className="hint">{item.columns.map(col => `${col.name} (${col.type})`).join(' · ')}</p>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  )
}
