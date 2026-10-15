import { createClient } from '@supabase/supabase-js'
import {
  aggregate,
  canonicalRegion,
  normalizeNominatim,
  SEED_REGIONS,
  validateObservation,
  localDate,
} from './domain'
import type { Dataset, Observation, Region, WeatherDay } from './domain'
import { fetchWeather, fetchJSON } from '../../supabase/functions/_shared/weather'
// The dev server forwards only these four public providers using normal TLS verification.
// Production demo uses the public HTTPS APIs; shared mode uses the Edge Function.
function providerJSON(url: string, init?: RequestInit): Promise<any> {
  if (import.meta.env.DEV) {
    const u = new URL(url)
    const providers: Record<string, string> = {
      'nominatim.openstreetmap.org': 'nominatim',
      'api.open-meteo.com': 'forecast',
      'archive-api.open-meteo.com': 'archive',
      'air-quality-api.open-meteo.com': 'air',
    }
    if (providers[u.hostname])
      return fetchJSON(`/external/${providers[u.hostname]}${u.pathname}${u.search}`, init)
  }
  return fetchJSON(url, init)
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const DEMO = !url && !key
export const CONFIG_ERROR =
  !DEMO && (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))
    ? 'Supabase URL과 공개 키 설정을 확인해 주세요. 연결 실패 시 데모로 자동 전환하지 않습니다.'
    : null
const supabase =
  !DEMO && !CONFIG_ERROR
    ? createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null
async function invoke<T>(action: string, payload: object = {}): Promise<T> {
  if (CONFIG_ERROR || !supabase)
    throw new Error(CONFIG_ERROR || '데이터베이스 연결이 설정되지 않았습니다.')
  const { data, error } = await supabase.functions.invoke('atlas', { body: { action, ...payload } })
  if (error) {
    let message = '공동 관측 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    try {
      const body = await error.context.json()
      if (body.error) message = body.error
    } catch {
      /* Network error. */
    }
    throw new Error(message)
  }
  return data as T
}
const STORE_KEY = 'booger-atlas:demo:v1'
interface DemoStore {
  version: 1
  observations: Observation[]
  regions: Region[]
  submissions: number[]
}
function readDemo(): DemoStore {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { version: 1, observations: [], regions: [...SEED_REGIONS], submissions: [] }
    const data = JSON.parse(raw) as DemoStore
    if (
      data.version !== 1 ||
      !Array.isArray(data.observations) ||
      !Array.isArray(data.regions) ||
      !Array.isArray(data.submissions) ||
      data.observations.some((o) => validateObservation(o, localDate()) !== null)
    )
      throw new Error('invalid')
    return data
  } catch {
    throw new Error(
      '브라우저의 데모 저장소를 읽을 수 없습니다. 저장소 접근 권한을 확인하거나 데모 기록을 초기화해 주세요.',
    )
  }
}
function writeDemo(data: DemoStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data))
  } catch {
    throw new Error(
      '브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 기록을 저장하지 못했습니다.',
    )
  }
}
export async function loadDataset(): Promise<Dataset> {
  if (!DEMO) return invoke<Dataset>('stats')
  const data = readDemo()
  return { regions: data.regions, cells: aggregate(data.observations) }
}
export function resetDemo() {
  localStorage.removeItem(STORE_KEY)
}
export async function saveObservation(
  observation: Observation,
  region: Region,
  trap: string,
  startedAt: number,
): Promise<void> {
  const invalid = validateObservation(observation)
  if (invalid) throw new Error(invalid)
  if (trap || Date.now() - startedAt < 800)
    throw new Error('입력 내용을 확인한 후 다시 등록해 주세요.')
  if (!DEMO) {
    await invoke('record', { observation, trap, startedAt })
    return
  }
  const data = readDemo()
  if (data.observations.some((o) => o.id === observation.id)) return
  const recent = data.submissions.filter((t) => Date.now() - t < 600000)
  if (recent.length >= 5)
    throw new Error('10분에 최대 5건까지 등록할 수 있습니다. 잠시 후 다시 시도해 주세요.')
  if (!data.regions.some((r) => r.id === region.id)) data.regions.push(region)
  data.observations.push(observation)
  data.submissions = [...recent, Date.now()]
  writeDemo(data)
}
let nextGeocode = 0
async function nominatim(path: string, params: Record<string, string>): Promise<any> {
  if (Date.now() < nextGeocode) throw new Error('지역 검색은 1초 간격으로 이용해 주세요.')
  nextGeocode = Date.now() + 1100
  return providerJSON(
    `https://nominatim.openstreetmap.org/${path}?${new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1', extratags: '1', 'accept-language': 'ko,en' })}`,
  )
}
export async function searchRegions(query: string): Promise<Region[]> {
  const q = query.trim()
  if (q.length < 2) throw new Error('지역 이름을 두 글자 이상 입력해 주세요.')
  if (!DEMO) return invoke<Region[]>('search', { query: q })
  const local = SEED_REGIONS.filter((r) => `${r.country} ${r.admin1} ${r.name}`.includes(q))
  if (local.length) return local
  const cacheKey = `booger-atlas:geocode:v1:${q.toLocaleLowerCase()}`
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (cached?.expires > Date.now()) return cached.regions
  } catch {
    /* Optional search cache. */
  }
  const raw = await nominatim('search', { q, limit: '15', layer: 'address' })
  const regions = [
    ...new Map(
      (raw as Record<string, unknown>[])
        .map(normalizeNominatim)
        .filter((r): r is Region => !!r)
        .map((r) => [r.id, canonicalRegion(r)]),
    ).values(),
  ]
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ expires: Date.now() + 30 * 86400000, regions }))
  } catch {
    /* Optional search cache. */
  }
  return regions
}
export async function reverseRegion(latitude: number, longitude: number): Promise<Region> {
  if (!DEMO) return invoke<Region>('reverse', { latitude, longitude })
  // Coordinates travel only to the geocoder. Only the returned administrative centroid is retained.
  const place = await nominatim('reverse', {
    lat: String(latitude),
    lon: String(longitude),
    zoom: '10',
  })
  const direct = normalizeNominatim(place)
  if (direct) {
    await new Promise((r) => setTimeout(r, 1100))
    const list = await nominatim('lookup', { osm_ids: `R${place.osm_id}` })
    const region = normalizeNominatim(list[0] || {})
    if (region) return region
    throw new Error('행정구역 대표 지점을 확인하지 못했습니다. 직접 검색해 주세요.')
  }
  const a = place.address || {}
  const name = a.city_district || a.borough || a.county || a.city || a.town
  if (!name) throw new Error('이 위치의 행정구역을 확인하지 못했습니다. 직접 지역을 검색해 주세요.')
  await new Promise((r) => setTimeout(r, 1100))
  const list = await searchRegions(`${a.country || ''} ${a.state || ''} ${name}`)
  const exact = list.filter((r) => r.name === name)
  if (exact.length !== 1)
    throw new Error('행정구역을 확정할 수 없습니다. 직접 지역을 검색해 주세요.')
  return exact[0]
}
const inFlight = new Map<string, Promise<WeatherDay[]>>()
export function getWeather(region: Region, date?: string): Promise<WeatherDay[]> {
  const requestKey = `${DEMO ? 'demo' : 'shared'}:${region.id}:${date || 'forecast'}`
  if (inFlight.has(requestKey)) return inFlight.get(requestKey)!
  const request = loadWeather(region, date).finally(() => inFlight.delete(requestKey))
  inFlight.set(requestKey, request)
  return request
}
async function loadWeather(region: Region, date?: string): Promise<WeatherDay[]> {
  if (!DEMO) return invoke<WeatherDay[]>('weather', { regionId: region.id, date })
  const key = `booger-atlas:weather:v1:${region.id}:${date || localDate() + ':forecast'}`
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const cache = JSON.parse(raw)
      if (cache.expires > Date.now()) return cache.data
    }
  } catch {
    /* Cache is optional. */
  }
  const promise = fetchWeather(region, date, providerJSON).then((data) => {
    const old = date && date < new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ expires: Date.now() + (old ? 30 * 86400000 : 3600000), data }),
      )
    } catch {
      /* Cache is optional. */
    }
    return data
  })
  return promise
}
