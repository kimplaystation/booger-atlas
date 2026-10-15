import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Cell, WeatherDay } from '../lib/domain'
import { dailySeries } from '../lib/domain'
export function TrendChart({ cells, weather }: { cells: Cell[]; weather: WeatherDay[] }) {
  const data = dailySeries(cells).map((d) => {
    const w = weather.find((w) => w.date === d.date)
    return {
      date: d.date,
      dryness: d.average,
      temperature: w?.temperature ?? null,
      humidity: w?.humidity ?? null,
    }
  })
  if (!data.length)
    return (
      <div className="chart-empty">
        선택 기간의 관측 데이터가 없습니다.
        <small>표본이 쌓이면 날짜별 건조도와 날씨를 함께 보여드립니다.</small>
      </div>
    )
  return (
    <>
      <div
        className="trend-chart"
        role="img"
        aria-label="날짜별 평균 건조도, 기온, 상대습도 비교 그래프"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 15, right: 2, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e3e8e1" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => v.slice(5).replace('-', '.')}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="dry"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="humidity"
              orientation="right"
              domain={[0, 100]}
              unit="%"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis yAxisId="temp" hide domain={['auto', 'auto']} />
            <Tooltip
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => [
                typeof value === 'number' ? value.toFixed(1) : '자료 없음',
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            <Line
              yAxisId="dry"
              dataKey="dryness"
              name="평균 건조도 (1~5)"
              stroke="#315b42"
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls={false}
            />
            <Line
              yAxisId="humidity"
              dataKey="humidity"
              name="상대습도 (%)"
              stroke="#8aaabb"
              strokeDasharray="4 3"
              connectNulls={false}
            />
            <Line
              yAxisId="temp"
              dataKey="temperature"
              name="기온 (°C · 독립 축)"
              stroke="#c3a064"
              strokeWidth={2}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="data-details">
        <summary>그래프 데이터 표로 보기</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>건조도</th>
                <th>기온 °C</th>
                <th>습도 %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.dryness?.toFixed(1)}</td>
                  <td>{d.temperature ?? '자료 없음'}</td>
                  <td>{d.humidity ?? '자료 없음'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}
