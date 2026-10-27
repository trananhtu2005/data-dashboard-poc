import { FormEvent, useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useApi, User } from '../App'

type Dashboard = {
  id: number
  name: string
  description: string | null
  tags: string[]
  owner_id: number | null
  owner_username: string | null
  charts: { chart_id: number; position: Record<string, unknown> }[]
  share_token: string | null
  created_at: string
  updated_at: string
}

export default function DashboardsPage({ token, user }: { token: string; user: User }) {
  const api = useApi(token)
  const navigate = useNavigate()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [shareToken, setShareToken] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const [currentDashboardId, setCurrentDashboardId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadDashboards()
  }, [search, selectedTag])

  async function loadDashboards() {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (selectedTag) params.set('tag', selectedTag)
      const url = `/dashboards${params.toString() ? '?' + params.toString() : ''}`
      setDashboards(await api(url) as Dashboard[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dashboards.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
      await api('/dashboards', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || null, tags: tagList })
      })
      setName('')
      setDescription('')
      setTags('')
      await loadDashboards()
      setNotice('Đã tạo dashboard.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được dashboard.')
    }
  }

  async function deleteDashboard(id: number) {
    if (!window.confirm('Xóa dashboard này?')) return
    try {
      await api(`/dashboards/${id}`, { method: 'DELETE' })
      await loadDashboards()
      setNotice('Đã xóa dashboard.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được dashboard.')
    }
  }

  async function shareDashboard(id: number) {
    setCurrentDashboardId(id)
    setSharePassword('')
    setShowShareModal(true)
  }

  async function generateShareLink() {
    if (!currentDashboardId) return
    try {
      const result = await api(`/dashboards/${currentDashboardId}/share`, {
        method: 'POST',
        body: JSON.stringify({ password: sharePassword || null })
      }) as { share_token: string; share_url: string; password_protected: boolean }
      setShareToken(result.share_token)
      setNotice(result.password_protected ? 'Đã tạo link chia sẻ có mật khẩu.' : 'Đã tạo link chia sẻ.')
      await loadDashboards()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được link chia sẻ.')
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setNotice('Đã copy vào clipboard.')
    }).catch(() => {
      setError('Không thể copy.')
    })
  }

  const allTags = Array.from(new Set(dashboards.flatMap(d => d.tags)))

  function formatDate(isoString: string): string {
    const date = new Date(isoString)
    return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">TRỰC QUAN</p>
        <h1>Dashboards</h1>
        <p className="muted">Tạo dashboard, kéo thả biểu đồ, chia sẻ và nhúng vào ứng dụng khác.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {user.role !== 'viewer' && (
          <form className="connection-form" onSubmit={handleSubmit}>
            <h2>Tạo Dashboard mới</h2>
            <label htmlFor="dashboard-name">Tên dashboard *</label>
            <input id="dashboard-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Sales Dashboard Q4" />

            <label htmlFor="dashboard-description">Mô tả</label>
            <textarea id="dashboard-description" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Tổng quan doanh thu và đơn hàng quý 4..." />

            <label htmlFor="dashboard-tags">Tags (ngăn cách bằng dấu phẩy)</label>
            <input id="dashboard-tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="sales, quarterly, revenue" />

            <button type="submit">Tạo dashboard</button>
          </form>
        )}

        <section className="connection-list" style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Tìm kiếm dashboard..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: '1', minWidth: '200px', height: '40px' }}
            />
            {allTags.length > 0 && (
              <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)} style={{ height: '40px', minWidth: '150px' }}>
                <option value="">🏷️ Tất cả tags</option>
                {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            )}
          </div>

          <h2>Danh sách Dashboards ({dashboards.length})</h2>
          {dashboards.length === 0 ? (
            <p className="muted">Chưa có dashboard nào.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginTop: '16px' }}>
              {dashboards.map(dashboard => (
                <article
                  key={dashboard.id}
                  style={{
                    border: '1px solid #d5ddd7',
                    borderRadius: '12px',
                    padding: '20px',
                    background: '#fff',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                  onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                >
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1a2621', marginBottom: '8px' }}>
                      {dashboard.name}
                    </h3>
                    {dashboard.description && (
                      <p style={{ fontSize: '14px', color: '#64736a', margin: '8px 0', lineHeight: 1.5 }}>
                        {dashboard.description.length > 120 ? dashboard.description.slice(0, 120) + '...' : dashboard.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '12px 0' }}>
                      {dashboard.tags.map(tag => (
                        <span
                          key={tag}
                          style={{
                            background: '#e8f0eb',
                            color: '#35423c',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '13px', color: '#8a9991', marginTop: '12px' }}>
                      <div>📊 {dashboard.charts.length} biểu đồ</div>
                      <div style={{ marginTop: '4px' }}>👤 {dashboard.owner_username || 'Không rõ'}</div>
                      <div style={{ marginTop: '4px' }}>🕐 {formatDate(dashboard.updated_at)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e8f0eb' }} onClick={e => e.stopPropagation()}>
                    <button
                      className="secondary"
                      style={{ flex: 1, fontSize: '13px', padding: '8px' }}
                      onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                    >
                      Xem
                    </button>
                    {user.role !== 'viewer' && (
                      <>
                        <button
                          className="secondary"
                          style={{ flex: 1, fontSize: '13px', padding: '8px' }}
                          onClick={() => shareDashboard(dashboard.id)}
                        >
                          Chia sẻ
                        </button>
                        <button
                          className="danger"
                          style={{ fontSize: '13px', padding: '8px' }}
                          onClick={() => void deleteDashboard(dashboard.id)}
                        >
                          Xóa
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {showShareModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowShareModal(false)}
          >
            <div
              style={{
                background: '#fff',
                padding: '32px',
                borderRadius: '12px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '80vh',
                overflow: 'auto'
              }}
              onClick={e => e.stopPropagation()}
            >
              <h2 style={{ margin: '0 0 20px', fontSize: '22px' }}>Chia sẻ Dashboard</h2>

              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="share-password" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                  Mật khẩu bảo vệ (tùy chọn)
                </label>
                <input
                  id="share-password"
                  type="password"
                  value={sharePassword}
                  onChange={e => setSharePassword(e.target.value)}
                  placeholder="Để trống nếu không cần mật khẩu"
                  style={{ width: '100%' }}
                />
                <p style={{ fontSize: '12px', color: '#64736a', marginTop: '6px' }}>
                  💡 Người xem sẽ phải nhập mật khẩu này để truy cập dashboard
                </p>
              </div>

              <button onClick={() => void generateShareLink()} style={{ width: '100%', marginBottom: '20px' }}>
                Tạo link chia sẻ
              </button>

              {shareToken && (
                <div>
                  <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Link chia sẻ</h3>
                  <div style={{ background: '#f3f6f4', padding: '12px', borderRadius: '8px', marginBottom: '12px', wordBreak: 'break-all', fontSize: '13px', fontFamily: 'monospace' }}>
                    {window.location.origin}/embed/{shareToken}
                  </div>
                  <button className="secondary" onClick={() => copyToClipboard(`${window.location.origin}/embed/${shareToken}`)} style={{ width: '100%', marginBottom: '20px' }}>
                    📋 Copy link
                  </button>

                  <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Mã nhúng iframe</h3>
                  <p style={{ fontSize: '12px', color: '#64736a', marginBottom: '8px' }}>
                    Copy đoạn code sau vào trang web của bạn để nhúng dashboard:
                  </p>
                  <div style={{ background: '#f3f6f4', padding: '12px', borderRadius: '8px', marginBottom: '12px', wordBreak: 'break-all', fontSize: '12px', fontFamily: 'monospace' }}>
                    {`<iframe src="${window.location.origin}/embed/${shareToken}" width="100%" height="600" frameborder="0"></iframe>`}
                  </div>
                  <button className="secondary" onClick={() => copyToClipboard(`<iframe src="${window.location.origin}/embed/${shareToken}" width="100%" height="600" frameborder="0"></iframe>`)} style={{ width: '100%', marginBottom: '12px' }}>
                    📋 Copy mã iframe
                  </button>

                  <div style={{ background: '#e8f0eb', padding: '16px', borderRadius: '8px', marginTop: '20px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>📖 Hướng dẫn sử dụng</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: 1.6, color: '#35423c' }}>
                      <li>Link chia sẻ là công khai, ai có link đều có thể xem</li>
                      <li>Nếu đặt mật khẩu, người xem phải nhập đúng mật khẩu</li>
                      <li>Dashboard được nhúng sẽ hiển thị real-time data</li>
                      <li>Người xem không thể chỉnh sửa dashboard</li>
                    </ul>
                  </div>
                </div>
              )}

              <button className="secondary" onClick={() => setShowShareModal(false)} style={{ width: '100%', marginTop: '20px' }}>
                Đóng
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
