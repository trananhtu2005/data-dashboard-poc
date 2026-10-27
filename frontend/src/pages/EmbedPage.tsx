import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type ChartData = { id: number; name: string; dataset_id: number; config: { type: string; dimension: string; measure: string }; position: Record<string, number> }
type DashboardData = { dashboard: { id: number; name: string; description: string | null }; charts: ChartData[] }
type ChartDataResponse = { data: { name: string; value: number }[]; dimension_label: string; measure_label: string }

export default function EmbedPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [chartData, setChartData] = useState<Record<number, { name: string; value: number }[]>>({})
  const [chartLabels, setChartLabels] = useState<Record<number, { dimension: string; measure: string }>>({})
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (shareToken) void loadDashboard()
  }, [shareToken])

  async function loadDashboard(pwd?: string) {
    try {
      const url = pwd ? `${API}/embed/${shareToken}?password=${encodeURIComponent(pwd)}` : `${API}/embed/${shareToken}`
      const response = await fetch(url)
      if (response.status === 401) {
        setNeedsPassword(true)
        setError('Yêu cầu mật khẩu để xem dashboard này.')
        return
      }
      if (!response.ok) throw new Error('Dashboard không tồn tại hoặc chưa được chia sẻ.')
      const data = await response.json() as DashboardData
      setDashboard(data)
      setNeedsPassword(false)
      setError('')

      for (const chart of data.charts) {
        void loadChartData(chart.id, pwd)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dashboard.')
    }
  }

  async function loadChartData(chartId: number, pwd?: string) {
    try {
      const url = pwd
        ? `${API}/embed/${shareToken}/chart/${chartId}/data?password=${encodeURIComponent(pwd)}`
        : `${API}/embed/${shareToken}/chart/${chartId}/data`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Không tải được dữ liệu biểu đồ.')
      const result = await response.json() as ChartDataResponse
      setChartData(prev => ({ ...prev, [chartId]: result.data }))
      setChartLabels(prev => ({
        ...prev,
        [chartId]: {
          dimension: result.dimension_label,
          measure: result.measure_label
        }
      }))
    } catch (e) {
      console.error(`Không tải được dữ liệu chart ${chartId}:`, e)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    await loadDashboard(password)
  }

  function getEChartsOption(data: { name: string; value: number }[], type: string, dimension: string, measure: string) {
    const commonOption = {
      tooltip: { trigger: 'item' as const },
      legend: { show: data.length <= 10 }
    }

    if (type === 'pie') {
      return {
        ...commonOption,
        series: [{
          type: 'pie',
          data: data.map(d => ({ name: d.name, value: d.value })),
          radius: '60%'
        }]
      }
    }

    if (type === 'line') {
      return {
        ...commonOption,
        xAxis: {
          type: 'category' as const,
          data: data.map(d => d.name),
          name: dimension,
          nameLocation: 'middle' as const,
          nameGap: 30,
          nameTextStyle: { fontWeight: 600 }
        },
        yAxis: {
          type: 'value' as const,
          name: measure,
          nameLocation: 'middle' as const,
          nameGap: 50,
          nameTextStyle: { fontWeight: 600 }
        },
        series: [{ type: 'line', data: data.map(d => d.value), smooth: true }]
      }
    }

    return {
      ...commonOption,
      xAxis: {
        type: 'category' as const,
        data: data.map(d => d.name),
        name: dimension,
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { fontWeight: 600 }
      },
      yAxis: {
        type: 'value' as const,
        name: measure,
        nameLocation: 'middle' as const,
        nameGap: 50,
        nameTextStyle: { fontWeight: 600 }
      },
      series: [{ type: 'bar', data: data.map(d => d.value) }]
    }
  }

  if (needsPassword) {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1 style={{ marginBottom: '24px' }}>🔒 Dashboard được bảo vệ</h1>
          {error && <p className="error">{error}</p>}
          <form onSubmit={handlePasswordSubmit}>
            <label htmlFor="password">Mật khẩu</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
            <button type="submit">Xem Dashboard</button>
          </form>
        </section>
      </main>
    )
  }

  if (error && !needsPassword) {
    return (
      <main className="login-page">
        <section className="login-card">
          <p className="error">{error}</p>
        </section>
      </main>
    )
  }

  if (!dashboard) {
    return (
      <main className="login-page">
        <p>Đang tải dashboard...</p>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f3f6f4', padding: '24px' }}>
      <section style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '28px', marginBottom: '8px' }}>
          {dashboard.dashboard.name}
        </h1>
        {dashboard.dashboard.description && (
          <p style={{ color: '#64736a', marginBottom: '24px', fontSize: '15px' }}>
            {dashboard.dashboard.description}
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
          {dashboard.charts.map(chart => {
            const data = chartData[chart.id] || []
            const labels = chartLabels[chart.id] || { dimension: chart.config.dimension, measure: chart.config.measure }
            return (
              <div
                key={chart.id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e6ece8',
                  minHeight: '300px'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
                  {chart.name}
                </h3>
                {data.length > 0 ? (
                  <ReactECharts
                    option={getEChartsOption(data, chart.config.type, labels.dimension, labels.measure)}
                    style={{ height: '280px' }}
                  />
                ) : (
                  <p style={{ color: '#8a9991', textAlign: 'center', marginTop: '80px' }}>Đang tải dữ liệu...</p>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
