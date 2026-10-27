import { FormEvent, useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useApi, User } from '../App'

type Connection = { id: number; name: string }
type SavedQuery = { id: number; name: string; sql: string }
type TableInfo = { schema: string; table: string; columns: { name: string; type: string }[] }

export default function SQLLabPage({ token, user }: { token: string; user: User }) {
  const api = useApi(token)
  const [connections, setConnections] = useState<Connection[]>([])
  const [queries, setQueries] = useState<SavedQuery[]>([])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [sql, setSql] = useState('SELECT 1')
  const [connectionId, setConnectionId] = useState<number | ''>('')
  const [sqlColumns, setSqlColumns] = useState<string[]>([])
  const [sqlRows, setSqlRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const monacoRef = useRef<any>(null)

  useEffect(() => {
    void loadConnections()
    void loadQueries()
  }, [])

  useEffect(() => {
    if (connectionId) {
      void loadSchema(connectionId)
    }
  }, [connectionId])

  useEffect(() => {
    // Register autocomplete when tables change and monaco is available
    if (monacoRef.current && tables.length > 0) {
      registerAutocomplete()
    }
  }, [tables])

  async function loadConnections() {
    try {
      const data = await api('/connections') as Connection[]
      setConnections(data)
      if (data.length && !connectionId) setConnectionId(data[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được kết nối.')
    }
  }

  async function loadQueries() {
    try {
      setQueries(await api('/sql/queries') as SavedQuery[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được truy vấn.')
    }
  }

  async function loadSchema(connId: number) {
    try {
      const data = await api(`/connections/${connId}/schema`) as TableInfo[]
      setTables(data)
    } catch (e) {
      console.error('Không tải được schema:', e)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const connId = connectionId || connections[0]?.id
    if (!connId) {
      setError('Thêm kết nối PostgreSQL trước.')
      return
    }
    try {
      const result = await api('/sql/execute', {
        method: 'POST',
        body: JSON.stringify({ connection_id: connId, sql })
      }) as { columns: string[]; rows: Record<string, unknown>[] }
      setSqlColumns(result.columns)
      setSqlRows(result.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Truy vấn thất bại.')
    }
  }

  async function saveQuery() {
    const queryName = window.prompt('Tên truy vấn đã lưu?')
    if (!queryName) return
    if (user.role === 'viewer') {
      setError('Viewer không thể lưu truy vấn.')
      return
    }
    try {
      await api('/sql/queries', { method: 'POST', body: JSON.stringify({ name: queryName, sql }) })
      await loadQueries()
      setNotice('Đã lưu truy vấn.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được truy vấn.')
    }
  }

  async function saveAsDataset() {
    const name = window.prompt('Tên dataset?')
    if (!name) return
    if (user.role === 'viewer') {
      setError('Viewer không thể tạo dataset.')
      return
    }
    const connId = connectionId || connections[0]?.id
    if (!connId) {
      setError('Chọn kết nối trước.')
      return
    }
    try {
      await api('/datasets', {
        method: 'POST',
        body: JSON.stringify({ name, connection_id: connId, source_type: 'sql', source_ref: sql })
      })
      setNotice('Đã tạo dataset từ SQL.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được dataset.')
    }
  }

  function handleEditorMount(_editor: any, monaco: any) {
    monacoRef.current = monaco
    if (tables.length > 0) {
      registerAutocomplete()
    }
  }

  function registerAutocomplete() {
    const monaco = monacoRef.current
    if (!monaco) return

    const tableNames = tables.map(t => `${t.schema}.${t.table}`)
    const columnNames = tables.flatMap(t => t.columns.map(c => c.name))

    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: () => {
        const suggestions = [
          ...tableNames.map(name => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: name,
            documentation: 'Table'
          })),
          ...columnNames.map(name => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: name,
            documentation: 'Column'
          }))
        ]
        return { suggestions }
      }
    })
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">KHÁM PHÁ</p>
        <h1>SQL Lab</h1>
        <p className="muted">Soạn và chạy truy vấn SELECT với gợi ý SQL.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form className="connection-form" onSubmit={handleSubmit}>
          <h2>Truy vấn SQL</h2>
          <label htmlFor="sql-connection">Kết nối PostgreSQL</label>
          <select
            id="sql-connection"
            value={connectionId || connections[0]?.id || ''}
            onChange={e => setConnectionId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Chọn kết nối</option>
            {connections.map(conn => (
              <option key={conn.id} value={conn.id}>{conn.name}</option>
            ))}
          </select>

          <label>SQL Editor (Ctrl+Space để gợi ý)</label>
          <div style={{ border: '1px solid #dce5df', borderRadius: '8px', overflow: 'hidden' }}>
            <Editor
              height="300px"
              defaultLanguage="sql"
              value={sql}
              onChange={value => setSql(value || '')}
              onMount={handleEditorMount}
              theme="vs"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                suggestOnTriggerCharacters: true,
                quickSuggestions: true
              }}
            />
          </div>

          <div className="actions">
            <button type="submit">Chạy truy vấn</button>
            {user.role !== 'viewer' && (
              <>
                <button className="secondary" type="button" onClick={saveQuery}>Lưu truy vấn</button>
                <button className="secondary" type="button" onClick={saveAsDataset}>Save as Dataset</button>
              </>
            )}
          </div>
        </form>

        {queries.length > 0 && (
          <section className="connection-list">
            <h2>Truy vấn đã lưu</h2>
            <div className="query-list">
              {queries.map(query => (
                <button className="secondary" key={query.id} onClick={() => setSql(query.sql)}>
                  {query.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {sqlRows.length > 0 && (
          <section className="connection-list">
            <h2>Kết quả truy vấn ({sqlRows.length} rows)</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>{sqlColumns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {sqlRows.map((row, index) => (
                    <tr key={index}>
                      {sqlColumns.map(col => <td key={col}>{String(row[col] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
