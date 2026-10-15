import { useEffect, useState } from 'react'
import { CloudSun, Droplets, Thermometer, Umbrella, Wind } from 'lucide-react'
import { getWeather } from '../lib/api'
import type { Region, WeatherDay } from '../lib/domain'
export default function WeatherPanel({ region }: { region: Region }) {
  const [days, setDays] = useState<WeatherDay[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setDays([])
    setLoading(true)
    setError('')
    getWeather(region)
      .then((d) => {
        if (active) setDays(d)
      })
      .catch(() => {
        if (active) setError('기상 API에 연결하지 못했습니다. 자료 없음')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [region, attempt])
  const value = (n: number | null, unit: string) =>
    n === null ? '자료 없음' : `${n.toFixed(1)}${unit}`
  return (
    <section className="panel weather-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">WEATHER BRIEFING</p>
          <h2>지역 기상 브리핑</h2>
        </div>
        <CloudSun size={25} />
      </div>
      <p className="muted small">{region.name} 대표 지점 · 지역 시간 기준 · 일평균 예보</p>
      {loading ? (
        <p className="loading-text">기상자료 조회 중…</p>
      ) : error ? (
        <div className="notice muted">
          {error}
          <button className="text-button" onClick={() => setAttempt((a) => a + 1)}>
            다시 조회
          </button>
        </div>
      ) : (
        <div className="forecast-days">
          {days.map((d, i) => (
            <article key={d.date}>
              <div className="forecast-date">
                <strong>{i === 0 ? '오늘' : '내일'}</strong>
                <span>{d.date.slice(5).replace('-', '.')}</span>
                <span className="tag">실제 기상예보</span>
              </div>
              <div className="forecast-temp">
                <CloudSun size={33} />
                <strong>{value(d.temperature, '°')}</strong>
              </div>
              <p>
                <Droplets size={14} />
                상대습도 <b>{value(d.humidity, '%')}</b>
              </p>
              <p>
                <Umbrella size={14} />
                강수량 <b>{value(d.precipitation, ' mm')}</b>
              </p>
              <p>
                <Wind size={14} />
                PM2.5 <b>{value(d.pm25, ' µg/m³')}</b>
              </p>
              <p>
                <Wind size={14} />
                PM10 <b>{value(d.pm10, ' µg/m³')}</b>
              </p>
            </article>
          ))}
        </div>
      )}
      <p className="source-note">
        <Thermometer size={12} /> Open-Meteo 기상 모델 · 예보는 관측 실측값과 다릅니다.
        {days[0] && ` 갱신 ${new Date(days[0].fetchedAt).toLocaleString('ko-KR')}`}
      </p>
    </section>
  )
}
