import { FormEvent, useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { useApi, User } from '../App'

type Dataset = { id: number; name: string; columns: string[]; column_metadata?: Record<string, Record<string, unknown>> }
type Chart = { id: number; name: string; dataset_id: number; config: { type: string; dimension: string; measure: string; aggregation: string } }
type ChartDataResponse = { data: { name: string; value: number }[]; dimension_label: string; measure_label: string }

export default function ChartsPage({ token }: { token: string; user: User }) {
  const api = useApi(token)
  const [charts, setCharts] = useState<Chart[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [name, setName] = useState('')
  const [datasetId, setDatasetId] = useState<number | ''>('')
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar')
  const [dimension, setDimension] = useState('')
  const [measure, setMeasure] = useState('')
  const [aggregation, setAggregation] = useState<'sum' | 'avg' | 'count' | 'min' | 'max'>('sum')
  const [previewData, setPreviewData] = useState<{ name: string; value: number }[]>([])
  const [previewLabels, setPreviewLabels] = useState<{ dimension: string; measure: string }>({ dimension: '', measure: '' })
  const [previewChart, setPreviewChart] = useState<Chart | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadCharts()
    void loadDatasets()
  }, [])

  async function loadCharts() {
    try {
      setCharts(await api('/charts') as Chart[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được charts.')
    }
  }

  async function loadDatasets() {
    try {
      setDatasets(await api('/datasets') as Dataset[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được datasets.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (datasetId === '') return
    const dataset = datasets.find(d => d.id === datasetId)
    const dim = dimension || dataset?.columns[0]
    const meas = measure || dataset?.columns.find(c => c !== dim)
    if (!dim || !meas) {
      setError('Dataset cần ít nhất hai cột để tạo biểu đồ.')
      return
    }
    try {
      await api('/charts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          dataset_id: datasetId,
          config: { type: chartType, dimension: dim, measure: meas, aggregation }
        })
      })
      setName('')
      setDimension('')
      setMeasure('')
      setAggregation('sum')
      await loadCharts()
      setNotice('Đã lưu biểu đồ.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được biểu đồ.')
    }
  }

  async function previewChartData(chart: Chart) {
    try {
      const response = await api(`/charts/${chart.id}/data`) as ChartDataResponse
      setPreviewData(response.data)
      setPreviewLabels({ dimension: response.dimension_label, measure: response.measure_label })
      setPreviewChart(chart)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu biểu đồ.')
    }
  }

  async function deleteChart(id: number) {
    if (!window.confirm('Xóa biểu đồ này?')) return
    try {
      await api(`/charts/${id}`, { method: 'DELETE' })
      await loadCharts()
      setNotice('Đã xóa biểu đồ.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được biểu đồ.')
    }
  }

  function getEChartsOption(data: { name: string; value: number }[], type: string, dimLabel: string, measLabel: string) {
    const commonOption = {
      tooltip: {
        trigger: type === 'pie' ? 'item' as const : 'axis' as const,
        formatter: type === 'pie' ? '{b}: {c} ({d}%)' : '{b}<br/>{a}: {c}'
      },
      legend: {
        show: true,
        top: 5,
        textStyle: { fontSize: 11 },
        type: data.length > 10 ? 'scroll' as const : 'plain' as const
      }
    }

    if (type === 'pie') {
      return {
        ...commonOption,
        series: [{
          name: measLabel,
          type: 'pie',
          data: data.map(d => ({ name: d.name, value: d.value })),
          radius: ['40%', '65%'],
          label: { fontSize: 11, formatter: '{b}: {d}%' }
        }]
      }
    }

    if (type === 'line') {
      return {
        ...commonOption,
        grid: { left: 70, right: 20, top: 50, bottom: 60 },
        xAxis: {
          type: 'category' as const,
          data: data.map(d => d.name),
          name: dimLabel,
          nameLocation: 'middle' as const,
          nameGap: 35,
          nameTextStyle: { fontWeight: 600, fontSize: 12 },
          axisLabel: { fontSize: 11, rotate: data.length > 5 ? 30 : 0 }
        },
        yAxis: {
          type: 'value' as const,
          name: measLabel,
          nameLocation: 'middle' as const,
          nameGap: 55,
          nameTextStyle: { fontWeight: 600, fontSize: 12 },
          axisLabel: { fontSize: 11 }
        },
        series: [{ name: measLabel, type: 'line', data: data.map(d => d.value), smooth: true }]
      }
    }

    return {
      ...commonOption,
      grid: { left: 70, right: 20, top: 50, bottom: 60 },
      xAxis: {
        type: 'category' as const,
        data: data.map(d => d.name),
        name: dimLabel,
        nameLocation: 'middle' as const,
        nameGap: 35,
        nameTextStyle: { fontWeight: 600, fontSize: 12 },
        axisLabel: { fontSize: 11, rotate: data.length > 5 ? 30 : 0 }
      },
      yAxis: {
        type: 'value' as const,
        name: measLabel,
        nameLocation: 'middle' as const,
        nameGap: 55,
        nameTextStyle: { fontWeight: 600, fontSize: 12 },
        axisLabel: { fontSize: 11 }
      },
      series: [{ name: measLabel, type: 'bar', data: data.map(d => d.value) }]
    }
  }

  const selectedDataset = datasets.find(d => d.id === datasetId)

  function getColumnLabel(col: string): string {
    if (!selectedDataset?.column_metadata) return col
    return selectedDataset.column_metadata[col]?.friendly_name as string || col
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">TRỰC QUAN HÓA</p>
        <h1>Chart Builder</h1>
        <p className="muted">Tạo biểu đồ với tùy chọn tính toán sum, avg, count, min, max.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form className="connection-form" onSubmit={handleSubmit}>
          <h2>Tạo biểu đồ mới</h2>

          <label htmlFor="chart-name">Tên biểu đồ *</label>
          <input
            id="chart-name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Doanh thu theo sản phẩm"
          />

          <label htmlFor="chart-dataset">Dataset *</label>
          <select
            id="chart-dataset"
            required
            value={datasetId}
            onChange={e => {
              const id = e.target.value ? Number(e.target.value) : ''
              setDatasetId(id)
              setDimension('')
              setMeasure('')
            }}
          >
            <option value="">-- Chọn dataset --</option>
            {datasets.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
          </select>

          <label htmlFor="chart-type">Loại biểu đồ *</label>
          <select id="chart-type" value={chartType} onChange={e => setChartType(e.target.value as 'bar' | 'line' | 'pie')}>
            <option value="bar">📊 Cột (Bar)</option>
            <option value="line">📈 Đường (Line)</option>
            <option value="pie">🥧 Tròn (Pie)</option>
          </select>

          <div style={{ background: '#f3f6f4', padding: '16px', borderRadius: '8px', marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>Cấu hình dữ liệu</h3>

            <label htmlFor="chart-dimension">Chiều (Dimension) *</label>
            <select
              id="chart-dimension"
              value={dimension || selectedDataset?.columns[0] || ''}
              onChange={e => setDimension(e.target.value)}
              disabled={!selectedDataset}
            >
              <option value="">-- Chọn chiều --</option>
              {selectedDataset?.columns.map(col => (
                <option key={col} value={col}>{getColumnLabel(col)}</option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#64736a', marginTop: '4px' }}>
              💡 Chiều để nhóm dữ liệu (VD: danh mục, thời gian, khu vực)
            </p>

            <label htmlFor="chart-measure" style={{ marginTop: '12px' }}>Chỉ số (Measure) *</label>
            <select
              id="chart-measure"
              value={measure || selectedDataset?.columns.find(c => c !== (dimension || selectedDataset.columns[0])) || ''}
              onChange={e => setMeasure(e.target.value)}
              disabled={!selectedDataset}
            >
              <option value="">-- Chọn chỉ số --</option>
              {selectedDataset?.columns.filter(c => c !== (dimension || selectedDataset.columns[0])).map(col => (
                <option key={col} value={col}>{getColumnLabel(col)}</option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#64736a', marginTop: '4px' }}>
              💡 Giá trị số để tính toán (VD: doanh thu, số lượng, giá)
            </p>

            <label htmlFor="chart-aggregation" style={{ marginTop: '12px' }}>Cách tính (Aggregation) *</label>
            <select id="chart-aggregation" value={aggregation} onChange={e => setAggregation(e.target.value as typeof aggregation)}>
              <option value="sum">➕ Tổng (Sum)</option>
              <option value="avg">📊 Trung bình (Average)</option>
              <option value="count">🔢 Đếm (Count)</option>
              <option value="min">⬇️ Nhỏ nhất (Min)</option>
              <option value="max">⬆️ Lớn nhất (Max)</option>
            </select>
            <p style={{ fontSize: '12px', color: '#64736a', marginTop: '4px' }}>
              💡 Áp dụng cho các giá trị trùng dimension
            </p>
          </div>

          <button type="submit" style={{ marginTop: '16px' }}>💾 Lưu biểu đồ</button>
        </form>

        <section className="connection-list">
          <h2>Biểu đồ đã tạo ({charts.length})</h2>
          {charts.length === 0 ? (
            <p className="muted">Chưa có biểu đồ nào. Tạo biểu đồ đầu tiên ở trên.</p>
          ) : (
            charts.map(chart => {
              const aggLabels = { sum: 'Tổng', avg: 'TB', count: 'Đếm', min: 'Min', max: 'Max' }
              const agg = chart.config.aggregation || 'sum'
              return (
                <article className="connection" key={chart.id}>
                  <div style={{ flex: 1 }}>
                    <strong>{chart.name}</strong>
                    <p className="hint">
                      {chart.config.type === 'bar' ? '📊' : chart.config.type === 'line' ? '📈' : '🥧'} {chart.config.type} ·
                      {aggLabels[agg as keyof typeof aggLabels]}({chart.config.measure}) theo {chart.config.dimension}
                    </p>
                  </div>
                  <div className="actions">
                    <button className="secondary" onClick={() => void previewChartData(chart)}>👁️ Xem</button>
                    <button className="danger" onClick={() => void deleteChart(chart.id)}>🗑️ Xóa</button>
                  </div>
                </article>
              )
            })
          )}
        </section>

        {previewData.length > 0 && previewChart && (
          <section className="connection-list">
            <h2>Preview: {previewChart.name}</h2>
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e6ece8' }}>
              <ReactECharts
                option={getEChartsOption(previewData, previewChart.config.type, previewLabels.dimension, previewLabels.measure)}
                style={{ height: '400px' }}
              />
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
