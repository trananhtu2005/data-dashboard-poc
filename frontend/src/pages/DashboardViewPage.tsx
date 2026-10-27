import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Responsive, WidthProvider, Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { useApi, User } from '../App'

const ResponsiveGridLayout = WidthProvider(Responsive)

type Dashboard = { id: number; name: string; charts: { chart_id: number; position: Record<string, number> }[] }
type Chart = { id: number; name: string; config: { type: string; dimension: string; measure: string } }
type ChartDataResponse = { data: { name: string; value: number }[]; dimension_label: string; measure_label: string }

export default function DashboardViewPage({ token, user }: { token: string; user: User }) {
  const { id } = useParams<{ id: string }>()
  const api = useApi(token)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [charts, setCharts] = useState<Chart[]>([])
  const [allCharts, setAllCharts] = useState<Chart[]>([])
  const [chartData, setChartData] = useState<Record<number, { name: string; value: number }[]>>({})
  const [chartLabels, setChartLabels] = useState<Record<number, { dimension: string; measure: string }>>({})
  const [filteredData, setFilteredData] = useState<Record<number, { name: string; value: number }[]>>({})
  const [addChartId, setAddChartId] = useState<number | ''>('')
  const [layout, setLayout] = useState<Layout[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (id) {
      void loadDashboard()
      void loadAllCharts()
    }
  }, [id])

  useEffect(() => {
    applyFilters()
  }, [filters, chartData])

  async function loadDashboard() {
    try {
      const dashboards = await api('/dashboards') as Dashboard[]
      const found = dashboards.find(d => d.id === Number(id))
      if (!found) throw new Error('Dashboard không tồn tại.')
      setDashboard(found)

      const chartIds = found.charts.map(c => c.chart_id)
      const allChartsData = await api('/charts') as Chart[]
      const linkedCharts = allChartsData.filter(c => chartIds.includes(c.id))
      setCharts(linkedCharts)

      const initialLayout: Layout[] = found.charts.map(link => ({
        i: String(link.chart_id),
        x: link.position.x || 0,
        y: link.position.y || 0,
        w: link.position.w || 6,
        h: link.position.h || 4
      }))
      setLayout(initialLayout)

      for (const chart of linkedCharts) {
        void loadChartData(chart.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dashboard.')
    }
  }

  async function loadAllCharts() {
    try {
      setAllCharts(await api('/charts') as Chart[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách charts.')
    }
  }

  async function loadChartData(chartId: number) {
    try {
      const response = await api(`/charts/${chartId}/data`) as ChartDataResponse
      setChartData(prev => ({ ...prev, [chartId]: response.data }))
      setChartLabels(prev => ({
        ...prev,
        [chartId]: {
          dimension: response.dimension_label,
          measure: response.measure_label
        }
      }))
    } catch (e) {
      console.error(`Không tải được dữ liệu chart ${chartId}:`, e)
    }
  }

  function applyFilters() {
    const newFiltered: Record<number, { name: string; value: number }[]> = {}
    for (const [chartId, data] of Object.entries(chartData)) {
      const chart = charts.find(c => c.id === Number(chartId))
      if (!chart) continue

      const dimensionFilter = filters[chart.config.dimension]
      if (dimensionFilter && dimensionFilter !== 'all') {
        newFiltered[Number(chartId)] = data.filter(item => item.name === dimensionFilter)
      } else {
        newFiltered[Number(chartId)] = data
      }
    }
    setFilteredData(newFiltered)
  }

  async function addChartToDashboard() {
    if (addChartId === '' || !dashboard) return
    const existingCount = dashboard.charts.length
    try {
      await api(`/dashboards/${dashboard.id}/charts`, {
        method: 'POST',
        body: JSON.stringify({
          chart_id: addChartId,
          position: { x: (existingCount * 6) % 12, y: Math.floor(existingCount / 2) * 4, w: 6, h: 4 }
        })
      })
      setAddChartId('')
      await loadDashboard()
      setNotice('Đã thêm biểu đồ.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thêm được biểu đồ.')
    }
  }

  async function removeChartFromDashboard(chartId: number) {
    if (!dashboard || !window.confirm('Gỡ biểu đồ khỏi dashboard?')) return
    try {
      await api(`/dashboards/${dashboard.id}/charts/${chartId}`, { method: 'DELETE' })
      await loadDashboard()
      setNotice('Đã gỡ biểu đồ.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gỡ được biểu đồ.')
    }
  }

  async function saveLayout(newLayout: Layout[]) {
    if (!dashboard || user.role === 'viewer') return
    setLayout(newLayout)

    for (const item of newLayout) {
      const chartId = Number(item.i)
      try {
        await api(`/dashboards/${dashboard.id}/charts`, {
          method: 'POST',
          body: JSON.stringify({
            chart_id: chartId,
            position: { x: item.x, y: item.y, w: item.w, h: item.h }
          })
        })
      } catch (e) {
        console.error('Không lưu được vị trí:', e)
      }
    }
  }

  function getEChartsOption(data: { name: string; value: number }[], type: string, dimension: string, measure: string) {
    const commonOption = {
      tooltip: {
        trigger: 'item' as const,
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
          name: measure,
          type: 'pie',
          data: data.map(d => ({ name: d.name, value: d.value })),
          radius: ['40%', '65%'],
          label: {
            fontSize: 10,
            formatter: '{b}: {d}%'
          }
        }]
      }
    }

    if (type === 'line') {
      return {
        ...commonOption,
        tooltip: { trigger: 'axis' as const },
        grid: { left: 60, right: 20, top: 50, bottom: 50 },
        xAxis: {
          type: 'category' as const,
          data: data.map(d => d.name),
          name: dimension,
          nameLocation: 'middle' as const,
          nameGap: 25,
          nameTextStyle: { fontWeight: 600, fontSize: 11 },
          axisLabel: { fontSize: 10, rotate: data.length > 5 ? 30 : 0 }
        },
        yAxis: {
          type: 'value' as const,
          name: measure,
          nameLocation: 'middle' as const,
          nameGap: 45,
          nameTextStyle: { fontWeight: 600, fontSize: 11 },
          axisLabel: { fontSize: 10 }
        },
        series: [{ name: measure, type: 'line', data: data.map(d => d.value), smooth: true }]
      }
    }

    return {
      ...commonOption,
      tooltip: { trigger: 'axis' as const },
      grid: { left: 60, right: 20, top: 50, bottom: 50 },
      xAxis: {
        type: 'category' as const,
        data: data.map(d => d.name),
        name: dimension,
        nameLocation: 'middle' as const,
        nameGap: 25,
        nameTextStyle: { fontWeight: 600, fontSize: 11 },
        axisLabel: { fontSize: 10, rotate: data.length > 5 ? 30 : 0 }
      },
      yAxis: {
        type: 'value' as const,
        name: measure,
        nameLocation: 'middle' as const,
        nameGap: 45,
        nameTextStyle: { fontWeight: 600, fontSize: 11 },
        axisLabel: { fontSize: 10 }
      },
      series: [{ name: measure, type: 'bar', data: data.map(d => d.value) }]
    }
  }

  const allDimensions = Array.from(new Set(charts.map(c => c.config.dimension)))
  const dimensionValues: Record<string, Set<string>> = {}

  for (const chart of charts) {
    const dim = chart.config.dimension
    if (!dimensionValues[dim]) dimensionValues[dim] = new Set()
    const data = chartData[chart.id] || []
    data.forEach(item => dimensionValues[dim].add(item.name))
  }

  if (!dashboard) {
    return (
      <main className="workspace">
        <section className="content">
          <p>Đang tải dashboard...</p>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="workspace">
      <section className="content">
        <p className="eyebrow">DASHBOARD</p>
        <h1>{dashboard.name}</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {allDimensions.length > 0 && (
          <div className="connection-form" style={{ marginBottom: '24px' }}>
            <h2>Bộ lọc Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {allDimensions.map(dim => {
                // Find a chart that uses this dimension to get its label
                const chartWithDim = charts.find(c => c.config.dimension === dim)
                const dimLabel = chartWithDim && chartLabels[chartWithDim.id] ? chartLabels[chartWithDim.id].dimension : dim
                return (
                  <div key={dim}>
                    <label htmlFor={`filter-${dim}`}>{dimLabel}</label>
                    <select
                      id={`filter-${dim}`}
                      value={filters[dim] || 'all'}
                      onChange={e => setFilters({ ...filters, [dim]: e.target.value })}
                    >
                      <option value="all">Tất cả</option>
                      {Array.from(dimensionValues[dim] || []).map(val => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {user.role !== 'viewer' && (
          <div className="connection-form" style={{ marginBottom: '24px' }}>
            <h2>Thêm biểu đồ vào dashboard</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="add-chart">Chọn biểu đồ</label>
                <select
                  id="add-chart"
                  value={addChartId}
                  onChange={e => setAddChartId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Chọn biểu đồ</option>
                  {allCharts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={addChartToDashboard} disabled={addChartId === ''}>Thêm</button>
            </div>
          </div>
        )}

        {charts.length === 0 ? (
          <p className="muted">Dashboard chưa có biểu đồ nào.</p>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={80}
            isDraggable={user.role !== 'viewer'}
            isResizable={user.role !== 'viewer'}
            onLayoutChange={saveLayout}
          >
            {charts.map(chart => {
              const data = filteredData[chart.id] || chartData[chart.id] || []
              const labels = chartLabels[chart.id] || { dimension: chart.config.dimension, measure: chart.config.measure }
              return (
                <div key={String(chart.id)} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e6ece8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <strong>{chart.name}</strong>
                    {user.role !== 'viewer' && (
                      <button
                        className="danger"
                        style={{ height: '28px', padding: '0 10px', fontSize: '12px' }}
                        onClick={() => void removeChartFromDashboard(chart.id)}
                      >
                        Gỡ
                      </button>
                    )}
                  </div>
                  {data.length > 0 ? (
                    <ReactECharts
                      option={getEChartsOption(data, chart.config.type, labels.dimension, labels.measure)}
                      style={{ height: 'calc(100% - 40px)', minHeight: '200px' }}
                    />
                  ) : (
                    <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Không có dữ liệu</p>
                  )}
                </div>
              )
            })}
          </ResponsiveGridLayout>
        )}
      </section>
    </main>
  )
}
