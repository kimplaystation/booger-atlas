import type { Position } from './fieldApi'
export interface MapWeather {
  time: string
  temperature: number | null
  humidity: number | null
  precipitation: number | null
  windSpeed: number | null
  windDirection: number | null
  code: number | null
}
const cache = new Map<string, { expires: number; promise: Promise<MapWeather> }>()
/** ~1km query cells avoid sending a private placement coordinate to the weather provider. */
export function currentMapWeather(p: Position): Promise<MapWeather> {
  const latitude = p.latitude.toFixed(2),
    longitude = p.longitude.toFixed(2),
    key = `${latitude}:${longitude}`
  const old = cache.get(key)
  if (old && old.expires > Date.now()) return old.promise
  const url = new URL(
    import.meta.env.DEV
      ? '/external/forecast/v1/forecast'
      : 'https://api.open-meteo.com/v1/forecast',
    location.origin,
  )
  url.search = new URLSearchParams({
    latitude,
    longitude,
    timezone: 'UTC',
    wind_speed_unit: 'ms',
    current:
      'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code',
  }).toString()
  const promise = fetch(url, { signal: AbortSignal.timeout(10000) })
    .then(async (r) => {
      if (!r.ok) throw Error('기상자료 없음')
      const c = (await r.json()).current
      if (!c || typeof c.time !== 'string' || !Number.isFinite(Date.parse(`${c.time}Z`)))
        throw Error('기상자료 없음')
      const n = (v: unknown, min: number, max: number) =>
        typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null
      return {
        time: `${c.time}Z`,
        temperature: n(c.temperature_2m, -100, 70),
        humidity: n(c.relative_humidity_2m, 0, 100),
        precipitation: n(c.precipitation, 0, 1000),
        windSpeed: n(c.wind_speed_10m, 0, 150),
        windDirection: n(c.wind_direction_10m, 0, 360),
        code: n(c.weather_code, 0, 99),
      }
    })
    .catch((e) => {
      cache.delete(key)
      throw e
    })
  if (cache.size >= 50) cache.delete(cache.keys().next().value!)
  cache.set(key, { expires: Date.now() + 600000, promise })
  return promise
}
export function weatherLabel(code: number | null) {
  if (code === null) return '자료 없음'
  if (code === 0) return '맑음'
  if ([1, 2, 3].includes(code)) return '구름'
  if ([45, 48].includes(code)) return '안개'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '눈'
  if ([95, 96, 99].includes(code)) return '뇌우'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '비'
  return '자료 없음'
}
