import { FormEvent, useState, useEffect } from 'react'
import { useApi, User } from '../App'

type Connection = { id: number; name: string }
type Dataset = { id: number; name: string; source_type: string; columns: string[]; column_metadata?: Record<string, Record<string, unknown>> }
type TableInfo = { schema: string; table: string; columns: { name: string; type: string }[] }

export default function DatasetsPage({ token }: { token: string; user: User }) {
  const api = useApi(token)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [name, setName] = useState('')
  const [connectionId, setConnectionId] = useState<number | ''>('')
  const [sourceType, setSourceType] = useState<'table' | 'sql'>('table')
  const [sourceRef, setSourceRef] = useState('')
  const [showTableSuggestions, setShowTableSuggestions] = useState(false)
  const [previewColumns, setPreviewColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([])
  const [editingMetadata, setEditingMetadata] = useState<number | null>(null)
  const [columnNames, setColumnNames] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadDatasets()
    void loadConnections()
  }, [])

  useEffect(() => {
    if (connectionId) {
      void loadSchema(connectionId)
    }
  }, [connectionId])

  async function loadSchema(connId: number) {
    try {
      const result = await api(`/connections/${connId}/schema`) as { tables: TableInfo[] }
      setTables(result.tables || [])
    } catch (e) {
      console.error('Không tải được schema:', e)
      setTables([])
    }
  }

  async function loadDatasets() {
    try {
      setDatasets(await api('/datasets') as Dataset[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được datasets.')
    }
  }

  async function loadConnections() {
    try {
      const data = await api('/connections') as Connection[]
      setConnections(data)
      if (data.length && !connectionId) setConnectionId(data[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được kết nối.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const connId = connectionId || connections[0]?.id
    if (!connId) {
      setError('Chọn kết nối trước.')
      return
    }
    try {
      await api('/datasets', {
        method: 'POST',
        body: JSON.stringify({ name, connection_id: connId, source_type: sourceType, source_ref: sourceRef })
      })
      setName('')
      setSourceRef('')
      await loadDatasets()
      setNotice('Đã tạo dataset.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được dataset.')
    }
  }

  async function previewDataset(id: number) {
    try {
      const result = await api(`/datasets/${id}/preview`) as { columns: string[]; rows: Record<string, unknown>[] }
      setPreviewColumns(result.columns)
      setPreviewRows(result.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được preview.')
    }
  }

  async function deleteDataset(id: number) {
    if (!window.confirm('Xóa dataset này?')) return
    try {
      await api(`/datasets/${id}`, { method: 'DELETE' })
      await loadDatasets()
      setNotice('Đã xóa dataset.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được dataset.')
    }
  }

  function startEditMetadata(dataset: Dataset) {
    setEditingMetadata(dataset.id)
    const names: Record<string, string> = {}
    for (const col of dataset.columns) {
      names[col] = dataset.column_metadata?.[col]?.friendly_name as string || col
    }
    setColumnNames(names)
  }

  async function saveMetadata(datasetId: number) {
    const columns: Record<string, Record<string, unknown>> = {}
    for (const [col, friendly] of Object.entries(columnNames)) {
      if (friendly && friendly !== col) {
        columns[col] = { friendly_name: friendly }
      }
    }
    try {
      await api(`/datasets/${datasetId}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({ columns, metrics: {} })
      })
      setEditingMetadata(null)
      await loadDatasets()
      setNotice('Đã lưu tên cột thân thiện.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được metadata.')
    }
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">DỮ LIỆU</p>
        <h1>Datasets</h1>
        <p className="muted">Tạo dataset từ bảng hoặc SQL, đặt tên cột thân thiện với người dùng.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form className="connection-form" onSubmit={handleSubmit}>
          <h2>Tạo Dataset</h2>
          <label htmlFor="dataset-name">Tên dataset</label>
          <input id="dataset-name" required value={name} onChange={e => setName(e.target.value)} />

          <label htmlFor="dataset-connection">Kết nối</label>
          <select
            id="dataset-connection"
            required
            value={connectionId || connections[0]?.id || ''}
            onChange={e => setConnectionId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Chọn kết nối</option>
            {connections.map(conn => <option key={conn.id} value={conn.id}>{conn.name}</option>)}
          </select>

          <label htmlFor="source-type">Loại nguồn</label>
          <select id="source-type" value={sourceType} onChange={e => setSourceType(e.target.value as 'table' | 'sql')}>
            <option value="table">Bảng</option>
            <option value="sql">SQL Query</option>
          </select>

          <label htmlFor="source-ref">{sourceType === 'table' ? 'Bảng (schema.table)' : 'SQL Query'}</label>
          {sourceType === 'table' ? (
            <div style={{ position: 'relative' }}>
              <input
                id="source-ref"
                required
                placeholder="public.users"
                value={sourceRef}
                onChange={e => setSourceRef(e.target.value)}
                onFocus={() => setShowTableSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTableSuggestions(false), 200)}
                autoComplete="off"
              />
              {showTableSuggestions && tables.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'white',
                  border: '1px solid #d5ddd7',
                  borderRadius: '8px',
                  marginTop: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 100
                }}>
                  {tables
                    .filter(t => {
                      const tableName = `${t.schema}.${t.table}`
                      return !sourceRef || tableName.toLowerCase().includes(sourceRef.toLowerCase())
                    })
                    .slice(0, 20)
                    .map(t => {
                      const tableName = `${t.schema}.${t.table}`
                      return (
                        <div
                          key={tableName}
                          onClick={() => {
                            setSourceRef(tableName)
                            setShowTableSuggestions(false)
                          }}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f0f4f1',
                            fontSize: '14px'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f3f6f4'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >
                          <strong>{tableName}</strong>
                          <span style={{ color: '#8a9991', fontSize: '12px', marginLeft: '8px' }}>
                            ({t.columns.length} cột)
                          </span>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          ) : (
            <textarea id="source-ref" rows={4} required placeholder="SELECT * FROM schema.table" value={sourceRef} onChange={e => setSourceRef(e.target.value)} />
          )}

          <button type="submit">Tạo dataset</button>
        </form>

        <section className="connection-list">
          <h2>Datasets đã tạo</h2>
          {datasets.length === 0 ? (
            <p className="muted">Chưa có dataset nào.</p>
          ) : (
            datasets.map(dataset => (
              <article className="connection" key={dataset.id}>
                <div style={{ flex: 1 }}>
                  <strong>{dataset.name}</strong>
                  <p className="hint">{dataset.source_type} · {dataset.columns.length} cột</p>
                  {dataset.column_metadata && Object.keys(dataset.column_metadata).length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64736a' }}>
                      <strong>Tên thân thiện:</strong>
                      {Object.entries(dataset.column_metadata).map(([col, meta]: [string, any]) => (
                        meta.friendly_name && (
                          <div key={col} style={{ marginLeft: '8px' }}>
                            {col} → <span style={{ color: '#35423c', fontWeight: 500 }}>{meta.friendly_name}</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                  {editingMetadata === dataset.id && (
                    <div style={{ marginTop: '16px', padding: '16px', background: '#f3f6f4', borderRadius: '8px' }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>Đặt tên cột thân thiện</h3>
                      <p style={{ fontSize: '12px', color: '#64736a', marginBottom: '12px' }}>Tên thân thiện sẽ hiển thị thay cho tên cột gốc trong biểu đồ</p>
                      {dataset.columns.map(col => (
                        <div key={col} style={{ marginBottom: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: '#35423c' }}><strong>{col}</strong> (gốc)</span>
                          <input
                            style={{ width: '100%', height: '38px' }}
                            value={columnNames[col] || ''}
                            onChange={e => setColumnNames({ ...columnNames, [col]: e.target.value })}
                            placeholder={col}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="actions">
                  {editingMetadata === dataset.id ? (
                    <>
                      <button className="secondary" onClick={() => saveMetadata(dataset.id)}>Lưu</button>
                      <button className="secondary" onClick={() => setEditingMetadata(null)}>Hủy</button>
                    </>
                  ) : (
                    <>
                      <button className="secondary" onClick={() => void previewDataset(dataset.id)}>Preview</button>
                      <button className="secondary" onClick={() => startEditMetadata(dataset)}>Tên cột</button>
                      <button className="danger" onClick={() => void deleteDataset(dataset.id)}>Xóa</button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        {previewRows.length > 0 && (
          <section className="connection-list">
            <h2>Preview dữ liệu ({previewRows.length} rows)</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>{previewColumns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((row, index) => (
                    <tr key={index}>
                      {previewColumns.map(col => <td key={col}>{String(row[col] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewRows.length > 50 && <p className="hint" style={{ marginTop: '12px', textAlign: 'center' }}>Hiển thị 50/{previewRows.length} rows</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
