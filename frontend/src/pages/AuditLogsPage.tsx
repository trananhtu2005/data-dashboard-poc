import { useState, useEffect } from 'react'
import { useApi } from '../App'

type AuditLog = { id: number; user_id: number | null; action: string; resource: string; created_at: string }

export default function AuditLogsPage({ token }: { token: string }) {
  const api = useApi(token)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState('')

  useEffect(() => { void loadLogs() }, [])

  async function loadLogs() {
    try {
      setLogs(await api('/audit/logs?limit=100') as AuditLog[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được audit logs.')
    }
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">QUẢN TRỊ</p>
        <h1>Nhật ký truy cập</h1>
        <p className="muted">Theo dõi các hoạt động của người dùng trên hệ thống.</p>
        {error && <p className="error" role="alert">{error}</p>}

        <section className="connection-list">
          <h2>Nhật ký gần đây</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>User ID</th>
                  <th>Hành động</th>
                  <th>Tài nguyên</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('vi-VN')}</td>
                    <td>{log.user_id ?? 'N/A'}</td>
                    <td>{log.action}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.resource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}
