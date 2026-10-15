import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import {
  born,
  createField,
  DEFAULT_RADIUS,
  publicSpecimen,
  simulateHour,
  validPosition,
  validateTraits,
} from '../_shared/field.ts'
import type { FieldSpecimen, FieldWeather, LifeEvent } from '../_shared/field.ts'
import type { Region } from '../_shared/domain.ts'
const db = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const origins = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const radius = Math.max(
  10,
  Math.min(200, Number(Deno.env.get('FIELD_DISCOVERY_RADIUS_METERS')) || DEFAULT_RADIUS),
)
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const ensure = (r: { error: unknown }) => {
  if (r.error) throw new Failure(503, 'GPS 표본 데이터베이스에 연결하지 못했습니다.')
}
function json(data: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  })
}
async function rate(bucket: string, limit: number, seconds: number) {
  const r = await db.rpc('atlas_take_rate', {
    p_bucket: bucket,
    p_limit: limit,
    p_seconds: seconds,
  })
  ensure(r)
  if (!r.data) throw new Failure(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.')
}
async function digest(ip: string) {
  const secret = Deno.env.get('IP_HASH_SECRET') || ''
  if (secret.length < 32) throw new Failure(503, '서버의 IP_HASH_SECRET 설정이 필요합니다.')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}:${ip}`),
  )
  return Array.from(new Uint8Array(signed), (n) => n.toString(16).padStart(2, '0')).join('')
}
function uuid(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)
  )
}
async function region(id: string): Promise<Region> {
  const r = await db.from('atlas_regions').select('*').eq('id', id).maybeSingle()
  ensure(r)
  if (!r.data) throw new Failure(400, 'GPS로 행정구역을 다시 확인해 주세요.')
  const x = r.data
  return {
    id: x.id,
    name: x.name,
    country: x.country,
    countryCode: x.country_code,
    admin1: x.admin1,
    latitude: x.latitude,
    longitude: x.longitude,
    source: x.source,
  }
}
async function weatherFor(s: FieldSpecimen): Promise<FieldWeather[]> {
  const start = new Date(Date.parse(s.lastTick) + 3600000),
    end = new Date(Math.min(Date.now(), start.getTime() + 24 * 3600000))
  const from = start.toISOString().slice(0, 10),
    to = end.toISOString().slice(0, 10),
    key = `field-weather:v1:${s.region.id}:${from}:${to}`
  const cache = await db.from('atlas_api_cache').select('*').eq('key', key).maybeSingle()
  ensure(cache)
  if (cache.data && Date.parse(cache.data.expires_at) > Date.now()) return cache.data.payload
  const archive = Date.now() - start.getTime() > 5 * 86400000
  const u = new URL(
    archive
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast',
  )
  u.search = new URLSearchParams({
    latitude: String(s.region.latitude),
    longitude: String(s.region.longitude),
    start_date: from,
    end_date: to,
    timezone: 'UTC',
    wind_speed_unit: 'ms',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m',
  }).toString()
  const response = await fetch(u, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Failure(502, '기상자료 없음')
  const data = await response.json(),
    h = data.hourly
  if (!Array.isArray(h?.time)) throw new Failure(502, '기상자료 없음')
  const rows = h.time.map((t: string, i: number) => ({
    time: `${t}:00.000Z`,
    temperature: h.temperature_2m?.[i],
    humidity: h.relative_humidity_2m?.[i],
    precipitation: h.precipitation?.[i],
    windSpeed: h.wind_speed_10m?.[i],
    windDirection: h.wind_direction_10m?.[i],
    source: archive ? 'Open-Meteo ERA5 재분석' : 'Open-Meteo 기상 모델',
  }))
  const saved = await db
    .from('atlas_api_cache')
    .upsert({ key, payload: rows, expires_at: new Date(Date.now() + 1800000).toISOString() })
  ensure(saved)
  return rows
}
async function tick() {
  // Per-invocation and per-hour global limit prevents overlapping cron workers or repeated billable fetches.
  await rate('field-tick-worker', 1, 50)
  const due = await db
    .from('atlas_field_specimens')
    .select('*')
    .eq('status', 'alive')
    .lt('last_tick', new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString())
    .order('last_tick')
    .limit(20)
  ensure(due)
  const began = Date.now()
  let updated = 0,
    unavailable = 0
  for (const row of due.data || []) {
    if (Date.now() - began > 45000) break
    let current = row.state as FieldSpecimen
    try {
      const weather = await weatherFor(current)
      for (const hour of weather) {
        const result = simulateHour(current, hour)
        if (!result) continue
        const saved = await db.rpc('atlas_field_tick', {
          p_id: current.id,
          p_revision: current.revision,
          p_state: result.specimen,
          p_event: result.event,
        })
        ensure(saved)
        if (!saved.data) break
        current = result.specimen
        updated++
      }
    } catch {
      unavailable++ /* No invented weather and no timestamp advancement when unavailable. */
    }
  }
  return {
    updated,
    unavailable,
    source: 'Open-Meteo',
    simulation: '가상 게임 규칙 v1',
    remainingMayExist: true,
  }
}
Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || ''
  if (request.method === 'OPTIONS')
    return origins.includes(origin)
      ? json({}, 200, origin)
      : json({ error: '허용되지 않은 출처입니다.' }, 403)
  try {
    if (request.method !== 'POST') throw new Failure(405, 'POST 요청만 허용합니다.')
    if (Number(request.headers.get('content-length') || 0) > 16000)
      throw new Failure(413, '요청이 너무 큽니다.')
    const text = await request.text()
    if (text.length > 16000) throw new Failure(413, '요청이 너무 큽니다.')
    let b
    try {
      b = JSON.parse(text)
    } catch {
      throw new Failure(400, '요청 형식을 확인해 주세요.')
    }
    if (b.action === 'tick') {
      const secret = Deno.env.get('FIELD_CRON_SECRET') || ''
      if (secret.length < 32 || request.headers.get('Authorization') !== `Bearer ${secret}`)
        throw new Failure(401, '서버 작업 인증이 필요합니다.')
      return json(await tick())
    }
    if (!origins.includes(origin)) throw new Failure(403, '허용되지 않은 출처입니다.')
    const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',').at(-1)!.trim(),
      client = await digest(ip)
    await rate(`field:api:${client}`, 60, 60)
    if (b.action === 'create') {
      if (
        !uuid(b.id) ||
        !validateTraits(b.traits) ||
        !validPosition(b.position) ||
        !Number.isFinite(b.accuracy) ||
        b.accuracy < 0 ||
        b.accuracy > 100 ||
        typeof b.indoor !== 'boolean' ||
        typeof b.publicLocation !== 'boolean' ||
        typeof b.regionId !== 'string' ||
        !Number.isFinite(b.startedAt) ||
        Date.now() - b.startedAt < 800
      )
        throw new Failure(
          400,
          '표본 입력값 또는 GPS 정확도를 확인해 주세요. 오차 100m 이하에서 저장할 수 있습니다.',
        )
      const old = await db
        .from('atlas_field_specimens')
        .select('state')
        .eq('id', b.id)
        .maybeSingle()
      ensure(old)
      if (old.data) return json(publicSpecimen(old.data.state), 200, origin)
      await rate(`field:create:${client}`, 5, 600)
      await rate(`field:create-day:${client}`, 30, 86400)
      const r = await region(b.regionId)
      // A client GPS cannot be authenticated by a browser; rate limits and coarse storage minimize misuse.
      const s = createField(b.id, b.traits, r, b.position, b.indoor, b.publicLocation)
      const saved = await db.rpc('atlas_field_create', { p_state: s, p_event: born(s) })
      ensure(saved)
      return json(publicSpecimen(saved.data, [born(saved.data)]), 200, origin)
    }
    if (b.action === 'detail') {
      if (!uuid(b.id)) throw new Failure(400, '표본 링크를 확인해 주세요.')
      const result = await db
        .from('atlas_field_specimens')
        .select('state')
        .eq('id', b.id)
        .maybeSingle()
      ensure(result)
      if (!result.data) throw new Failure(404, '이 표본을 찾을 수 없습니다.')
      const events = await db
        .from('atlas_field_events')
        .select('event')
        .eq('specimen_id', b.id)
        .order('at', { ascending: false })
        .limit(500)
      ensure(events)
      return json(
        publicSpecimen(
          result.data.state,
          (events.data || []).reverse().map((e) => e.event as LifeEvent),
        ),
        200,
        origin,
      )
    }
    if (b.action === 'nearby' || b.action === 'world') {
      if (b.action === 'nearby' && !validPosition(b.position))
        throw new Failure(400, '현재 GPS를 확인해 주세요.')
      if (b.action === 'nearby') await rate(`field:nearby:${client}`, 12, 60)
      if (b.action === 'nearby') {
        const result = await db.rpc('atlas_field_nearby', {
          p_lat: b.position.latitude,
          p_lon: b.position.longitude,
          p_radius: radius,
        })
        ensure(result)
        return json(
          {
            radius,
            specimens: (result.data as FieldSpecimen[])
              .slice(0, 100)
              .map((s) => publicSpecimen(s, undefined, b.position))
              .sort((a, b) => a.distanceMeters! - b.distanceMeters!),
          },
          200,
          origin,
        )
      }
      // World feed is intentionally bounded and labeled; aggregate observation totals remain separate.
      const result = await db
        .from('atlas_field_specimens')
        .select('state')
        .order('last_tick', { ascending: false })
        .limit(500)
      ensure(result)
      return json(
        (result.data || []).map((r) => publicSpecimen(r.state as FieldSpecimen)),
        200,
        origin,
      )
    }
    throw new Failure(400, '지원하지 않는 요청입니다.')
  } catch (e) {
    return json(
      { error: e instanceof Failure ? e.message : 'GPS 표본 요청을 처리하지 못했습니다.' },
      e instanceof Failure ? e.status : 503,
      origins.includes(origin) ? origin : '',
    )
  }
})
