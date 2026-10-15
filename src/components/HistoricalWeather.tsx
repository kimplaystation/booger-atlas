import { useEffect, useState } from 'react'
import { getWeather } from '../lib/api'
import type { Region, WeatherDay } from '../lib/domain'
export default function HistoricalWeather({ region, dates }: { region: Region; dates: string[] }) {
  const [date, setDate] = useState(dates.at(-1) || ''),
    [day, setDay] = useState<WeatherDay | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    setDate(dates.at(-1) || '')
    setDay(null)
    setError('')
  }, [region.id, dates.join(',')])
  if (!dates.length) return null
  async function lookup() {
    setBusy(true)
    setError('')
    setDay(null)
    try {
      const result = await getWeather(region, date)
      setDay(result[0] || null)
      if (!result.length) setError('자료 없음')
    } catch {
      setError('이 날짜의 기상자료를 조회하지 못했습니다. 자료 없음')
    } finally {
      setBusy(false)
    }
  }
  const val = (n: number | null, unit: string) =>
    n === null ? '자료 없음' : `${n.toFixed(1)}${unit}`
  return (
    <div className="historical-weather">
      <label htmlFor="weather-date">관측일 기상자료 개별 조회</label>
      <div>
        <select
          id="weather-date"
          disabled={busy}
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setDay(null)
            setError('')
          }}
        >
          {[...dates].reverse().map((d) => (
            <option value={d} key={d}>
              {d}
            </option>
          ))}
        </select>
        <button className="outline" onClick={() => void lookup()} disabled={busy}>
          {busy ? '조회 중…' : '날씨 조회'}
        </button>
      </div>
      {error && (
        <p className="muted small" role="status">
          {error}
        </p>
      )}
      {day && (
        <div className="history-result">
          <strong>
            {day.date} ·{' '}
            {day.kind === 'archive'
              ? '과거 재분석 자료'
              : day.kind === 'recent'
                ? '최근 과거 모델 자료'
                : '당일 예보 자료'}
          </strong>
          <p>
            기온 {val(day.temperature, '°C')} · 습도 {val(day.humidity, '%')} · 강수량{' '}
            {val(day.precipitation, ' mm')}
          </p>
          <p>
            PM2.5 {val(day.pm25, ' µg/m³')} · PM10 {val(day.pm10, ' µg/m³')}
          </p>
          <small>{day.source} · 지역 대표 지점 기준</small>
        </div>
      )}
    </div>
  )
}
