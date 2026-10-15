import type { Region, WeatherDay } from './domain.ts'
import { shiftDate } from './domain.ts'
export async function fetchJSON(url: string, init: RequestInit = {}): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) })
  } catch {
    throw new Error(
      '외부 데이터 서비스에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.',
    )
  }
  if (!r.ok) throw new Error(`외부 데이터 서비스 응답 오류 (${r.status})`)
  try {
    return await r.json()
  } catch {
    throw new Error('외부 데이터 서비스의 응답 형식을 확인할 수 없습니다.')
  }
}
function mean(values: unknown[]): number | null {
  const ns = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null
}
export async function fetchWeather(
  region: Region,
  date?: string,
  readJSON: typeof fetchJSON = fetchJSON,
): Promise<WeatherDay[]> {
  const utcToday = new Date().toISOString().slice(0, 10)
  const historical = !!date && date < shiftDate(utcToday, -5)
  const base = historical
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast'
  const params = new URLSearchParams({
    latitude: String(region.latitude),
    longitude: String(region.longitude),
    timezone: 'auto',
    daily: 'temperature_2m_mean,precipitation_sum',
    hourly: 'relative_humidity_2m',
  })
  if (date) {
    params.set('start_date', date)
    params.set('end_date', date)
  } else params.set('forecast_days', '2')
  const json = await readJSON(`${base}?${params}`)
  if (!Array.isArray(json.daily?.time))
    throw new Error('기상자료의 날짜 정보를 확인할 수 없습니다.')
  let air: any = null
  // The air-quality API has limited historical coverage. Missing data stays null.
  if (!historical) {
    const p = new URLSearchParams({
      latitude: String(region.latitude),
      longitude: String(region.longitude),
      timezone: json.timezone || 'auto',
      hourly: 'pm2_5,pm10',
    })
    if (date) {
      p.set('start_date', date)
      p.set('end_date', date)
    } else p.set('forecast_days', '2')
    try {
      air = await readJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${p}`)
    } catch {
      /* Optional air-quality data unavailable. */
    }
  }
  const regionalToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: json.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const dayMean = (time: string[] = [], values: unknown[] = [], day: string) =>
    mean(time.flatMap((t, i) => (t.startsWith(day) ? [values[i]] : [])))
  return json.daily.time.map((day: string, i: number) => ({
    date: day,
    temperature:
      typeof json.daily.temperature_2m_mean?.[i] === 'number'
        ? json.daily.temperature_2m_mean[i]
        : null,
    humidity: dayMean(json.hourly?.time, json.hourly?.relative_humidity_2m, day),
    precipitation:
      typeof json.daily.precipitation_sum?.[i] === 'number'
        ? json.daily.precipitation_sum[i]
        : null,
    pm25: dayMean(air?.hourly?.time, air?.hourly?.pm2_5, day),
    pm10: dayMean(air?.hourly?.time, air?.hourly?.pm10, day),
    kind: historical ? 'archive' : day < regionalToday ? 'recent' : 'forecast',
    fetchedAt: new Date().toISOString(),
    source: historical ? 'Open-Meteo · ERA5 재분석' : 'Open-Meteo · 기상 모델',
  }))
}
