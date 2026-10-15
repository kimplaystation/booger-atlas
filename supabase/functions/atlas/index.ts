import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import {
  canonicalRegion,
  isDate,
  normalizeNominatim,
  validateObservation,
} from '../_shared/domain.ts'
import type { Region } from '../_shared/domain.ts'
import { fetchJSON, fetchWeather } from '../_shared/weather.ts'

class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const db = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
function ensure(result: { error: unknown }) {
  if (result.error)
    throw new APIError(503, '데이터베이스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
async function hash(value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(Deno.env.get('IP_HASH_SECRET') || ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function rate(bucket: string, limit: number, seconds: number) {
  const r = await db.rpc('atlas_take_rate', {
    p_bucket: bucket,
    p_limit: limit,
    p_seconds: seconds,
  })
  ensure(r)
  if (!r.data)
    throw new APIError(
      429,
      '요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요. (등록: 10분 5건, 하루 30건)',
    )
}
async function cached<T>(key: string, seconds: number, fn: () => Promise<T>): Promise<T> {
  const old = await db
    .from('atlas_api_cache')
    .select('payload,expires_at')
    .eq('key', key)
    .maybeSingle()
  ensure(old)
  if (old.data && Date.parse(old.data.expires_at) > Date.now()) {
    if (old.data.payload?.unavailable)
      throw new APIError(502, '기상자료 없음. 잠시 후 다시 조회해 주세요.')
    return old.data.payload as T
  }
  let data: T
  try {
    data = await fn()
  } catch (error) {
    if (key.startsWith('weather:')) {
      const failed = await db.from('atlas_api_cache').upsert({
        key,
        payload: { unavailable: true },
        expires_at: new Date(Date.now() + 120000).toISOString(),
      })
      ensure(failed)
    }
    throw error
  }
  const saved = await db
    .from('atlas_api_cache')
    .upsert({ key, payload: data, expires_at: new Date(Date.now() + seconds * 1000).toISOString() })
  ensure(saved)
  return data
}
function regionRow(r: Region) {
  return {
    id: r.id,
    name: r.name,
    country: r.country,
    country_code: r.countryCode,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    source: r.source,
  }
}
async function storeRegions(regions: Region[]) {
  if (!regions.length) return
  const r = await db
    .from('atlas_regions')
    .upsert(regions.map(regionRow), { onConflict: 'id', ignoreDuplicates: true })
  ensure(r)
}
async function geocode(path: string, params: Record<string, string>) {
  const slot = await db.rpc('atlas_take_geocoder_slot')
  ensure(slot)
  if (!slot.data)
    throw new APIError(429, '지역 검색 서버가 사용 중입니다. 2초 후 다시 검색해 주세요.')
  const contact = Deno.env.get('GEOCODER_CONTACT')
  if (!contact) throw new APIError(503, '관리자가 지역 검색 서비스 연락처를 설정해야 합니다.')
  return fetchJSON(
    `https://nominatim.openstreetmap.org/${path}?${new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1', extratags: '1', 'accept-language': 'ko,en' })}`,
    { headers: { 'User-Agent': `BoogerAtlas/0.1 (${contact})` } },
  )
}
async function search(query: unknown): Promise<Region[]> {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 160)
    throw new APIError(400, '검색어를 2~160자로 입력해 주세요.')
  const clean = query.trim()
  const cacheKey = 'geocode:v1:' + (await hash(clean.toLocaleLowerCase()))
  return cached(cacheKey, 30 * 86400, async () => {
    const raw = await geocode('search', { q: clean, limit: '15', layer: 'address' })
    const regions = [
      ...new Map(
        (raw as Record<string, unknown>[])
          .map(normalizeNominatim)
          .filter((r): r is Region => !!r)
          .map((r) => [r.id, canonicalRegion(r)]),
      ).values(),
    ]
    await storeRegions(regions)
    return regions
  })
}
Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || ''
  if (origin && !allowedOrigins.includes(origin))
    return json({ error: '허용되지 않은 사이트입니다.' }, 403, 'null')
  if (request.method === 'OPTIONS') return json({}, 200, origin)
  if (request.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405, origin)
  try {
    if ((Deno.env.get('IP_HASH_SECRET') || '').length < 32)
      throw new APIError(503, '관리자가 IP_HASH_SECRET을 설정해야 합니다.')
    // Supabase's ingress must append/overwrite X-Forwarded-For; take the rightmost hop.
    // Never store raw IP addresses or GPS request bodies. Verify header behavior if changing hosting.
    const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',').at(-1)!.trim()
    const day = new Date().toISOString().slice(0, 10)
    const client = await hash(`${day}:${ip}`)
    await rate(`api:${client}`, 90, 60)
    if (Number(request.headers.get('content-length') || 0) > 4096)
      throw new APIError(413, '요청이 너무 큽니다.')
    const raw = await request.text()
    if (raw.length > 4096) throw new APIError(413, '요청이 너무 큽니다.')
    let body: Record<string, any>
    try {
      body = JSON.parse(raw)
    } catch {
      throw new APIError(400, '올바른 JSON 요청이 필요합니다.')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new APIError(400, '요청 형식이 올바르지 않습니다.')
    if (body.action === 'stats') {
      const result = await db.rpc('atlas_dataset')
      ensure(result)
      return json(result.data, 200, origin)
    }
    if (body.action === 'search') {
      await rate(`search:${client}`, 20, 60)
      return json(await search(body.query), 200, origin)
    }
    if (body.action === 'reverse') {
      const { latitude, longitude } = body
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        throw new APIError(400, '위치 정보가 올바르지 않습니다.')
      await rate(`search:${client}`, 20, 60)
      // No coordinate cache. The reverse response is only used to identify an administrative relation.
      const place = await geocode('reverse', {
        lat: String(latitude),
        lon: String(longitude),
        zoom: '10',
      })
      let region = normalizeNominatim(place)
      await new Promise((r) => setTimeout(r, 1150))
      if (region) {
        const looked = await geocode('lookup', { osm_ids: `R${place.osm_id}` })
        region = normalizeNominatim(looked[0] || {})
      } else {
        const a = place.address || {},
          name = a.city_district || a.borough || a.county || a.city || a.town
        if (name) {
          const matches = (await search(`${a.country || ''} ${a.state || ''} ${name}`)).filter(
            (r) => r.name === name,
          )
          if (matches.length === 1) region = matches[0]
        }
      }
      if (!region)
        throw new APIError(422, '시·군·구급 행정구역을 찾지 못했습니다. 직접 검색해 주세요.')
      await storeRegions([region])
      return json(region, 200, origin)
    }
    if (body.action === 'record') {
      // UTC+14 allows every currently valid local calendar date without trusting the browser clock.
      const latestToday = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10)
      const invalid = validateObservation(body.observation, latestToday)
      if (invalid) throw new APIError(400, invalid)
      if (
        body.trap ||
        typeof body.startedAt !== 'number' ||
        Date.now() - body.startedAt < 800 ||
        Date.now() - body.startedAt > 86400000
      )
        throw new APIError(400, '입력 내용을 확인한 후 다시 등록해 주세요.')
      const o = body.observation
      if (
        typeof o.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.id)
      )
        throw new APIError(400, '등록 식별자가 올바르지 않습니다.')
      const existing = await db.from('atlas_observations').select('id').eq('id', o.id).maybeSingle()
      ensure(existing)
      if (existing.data) return json({ ok: true }, 200, origin)
      const region = await db.from('atlas_regions').select('id').eq('id', o.regionId).maybeSingle()
      ensure(region)
      if (!region.data) throw new APIError(400, '검색 결과에서 확인된 지역을 선택해 주세요.')
      await rate(`record:short:${client}`, 5, 600)
      await rate(`record:day:${client}`, 30, 86400)
      const inserted = await db.from('atlas_observations').upsert(
        {
          id: o.id,
          region_id: o.regionId,
          found_on: o.date,
          color: o.color,
          size: o.size,
          dryness: o.dryness,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
      ensure(inserted)
      return json({ ok: true }, 201, origin)
    }
    if (body.action === 'weather') {
      if (typeof body.regionId !== 'string' || body.regionId.length > 80)
        throw new APIError(400, '지역이 필요합니다.')
      if (
        body.date !== undefined &&
        (!isDate(body.date) ||
          body.date < '1940-01-01' ||
          body.date > new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10))
      )
        throw new APIError(400, '기상 조회 날짜가 올바르지 않습니다.')
      await rate(`weather:${client}`, 40, 60)
      const found = await db.from('atlas_regions').select('*').eq('id', body.regionId).maybeSingle()
      ensure(found)
      if (!found.data) throw new APIError(404, '지역을 찾을 수 없습니다.')
      const r = found.data
      const region: Region = {
        id: r.id,
        name: r.name,
        country: r.country,
        countryCode: r.country_code,
        admin1: r.admin1,
        latitude: r.latitude,
        longitude: r.longitude,
        source: r.source,
      }
      const historical =
        body.date && body.date < new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const weather = await cached(
        `weather:v1:${region.id}:${body.date || day + ':forecast'}`,
        historical ? 30 * 86400 : 3600,
        () => fetchWeather(region, body.date),
      )
      return json(weather, 200, origin)
    }
    throw new APIError(400, '지원하지 않는 요청입니다.')
  } catch (e) {
    if (e instanceof APIError) return json({ error: e.message }, e.status, origin)
    return json(
      { error: '외부 데이터 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      502,
      origin,
    )
  }
})
