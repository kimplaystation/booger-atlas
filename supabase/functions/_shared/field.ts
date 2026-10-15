import { COLORS, SIZES } from './domain.ts'
import type { Color, Region, Size } from './domain.ts'
export type Position = { latitude: number; longitude: number }
export type Traits = { color: Color; size: Size; dryness: number }
export interface FieldWeather {
  time: string
  temperature: number
  humidity: number
  precipitation: number
  windSpeed: number
  windDirection: number
  source: string
}
export interface LifeEvent {
  at: string
  type: 'created' | 'weather' | 'moved' | 'dissolved'
  description: string
  position: Position | null
  weather?: FieldWeather
}
export interface FieldSpecimen extends Traits {
  id: string
  region: Region
  createdAt: string
  lastTick: string
  status: 'alive' | 'dissolved'
  durability: number
  initialDryness: number
  indoor: boolean
  publicLocation: boolean
  position: Position
  revision: number
  accuracyMeters?: number
  ownerHash?: string
}
export interface PublicSpecimen extends Omit<
  FieldSpecimen,
  'position' | 'durability' | 'revision' | 'ownerHash'
> {
  position: Position | null
  isOwner?: boolean
  distanceMeters?: number
  bearingDegrees?: number
  events?: LifeEvent[]
}
export const FIELD_STORE = 'booger-atlas:field-demo:v1'
export const DEFAULT_RADIUS = 30
export const POSITION_GRID_METERS = 20
export const PUBLIC_GRID_METERS = 500
export function validPosition(p: unknown): p is Position {
  const v = p as Position | null
  return (
    !!v &&
    Number.isFinite(v.latitude) &&
    Math.abs(v.latitude) <= 85 &&
    Number.isFinite(v.longitude) &&
    Math.abs(v.longitude) <= 180
  )
}
export function validateTraits(t: unknown): t is Traits {
  const v = t as Traits | null
  return (
    !!v &&
    COLORS.some((c) => c.id === v.color) &&
    SIZES.some((s) => s.id === v.size) &&
    Number.isInteger(v.dryness) &&
    v.dryness >= 1 &&
    v.dryness <= 5
  )
}
const rad = Math.PI / 180
export function distance(a: Position, b: Position) {
  const x =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)))
}
export function bearing(a: Position, b: Position) {
  const dl = (b.longitude - a.longitude) * rad
  const y = Math.sin(dl) * Math.cos(b.latitude * rad)
  const x =
    Math.cos(a.latitude * rad) * Math.sin(b.latitude * rad) -
    Math.sin(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.cos(dl)
  return (Math.atan2(y, x) / rad + 360) % 360
}
export function move(p: Position, meters: number, bearing: number): Position {
  const angular = meters / 6371000,
    lat = p.latitude * rad,
    lon = p.longitude * rad,
    b = bearing * rad
  const newLat = Math.asin(
    Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(b),
  )
  const newLon =
    lon +
    Math.atan2(
      Math.sin(b) * Math.sin(angular) * Math.cos(lat),
      Math.cos(angular) - Math.sin(lat) * Math.sin(newLat),
    )
  return { latitude: newLat / rad, longitude: ((newLon / rad + 540) % 360) - 180 }
}
/** Coarse public positions and legacy records. New consented GPS placements keep precision privately. */
export function snap(p: Position, meters = POSITION_GRID_METERS): Position {
  const latStep = meters / 111320
  const latitude = Math.round(p.latitude / latStep) * latStep
  const lonStep = meters / (111320 * Math.cos(latitude * rad))
  return {
    latitude,
    longitude: Math.max(-180, Math.min(180, Math.round(p.longitude / lonStep) * lonStep)),
  }
}
export function publicSpecimen(
  s: FieldSpecimen,
  events?: LifeEvent[],
  viewer?: Position,
  owner = false,
): PublicSpecimen {
  // Explicit allowlist. Do not spread private state into public API responses.
  return {
    id: s.id,
    region: s.region,
    color: s.color,
    size: s.size,
    dryness: s.dryness,
    initialDryness: s.initialDryness,
    indoor: s.indoor,
    publicLocation: s.publicLocation,
    createdAt: s.createdAt,
    lastTick: s.lastTick,
    status: s.status,
    position: owner ? s.position : s.publicLocation ? snap(s.position, PUBLIC_GRID_METERS) : null,
    ...(owner ? { isOwner: true, accuracyMeters: s.accuracyMeters } : {}),
    ...(viewer
      ? {
          distanceMeters: Math.round(distance(viewer, s.position) / 10) * 10,
          bearingDegrees: (Math.round(bearing(viewer, s.position) / 45) * 45) % 360,
        }
      : {}),
    ...(events
      ? {
          events: events.map((e) => ({
            at: e.at,
            type: e.type,
            description: e.description,
            position: owner
              ? e.position
              : s.publicLocation && e.position
                ? snap(e.position, PUBLIC_GRID_METERS)
                : null,
            ...(e.weather ? { weather: e.weather } : {}),
          })),
        }
      : {}),
  }
}
export function createField(
  id: string,
  traits: Traits,
  region: Region,
  position: Position,
  indoor: boolean,
  publicLocation: boolean,
  now = new Date(),
  accuracyMeters?: number,
): FieldSpecimen {
  if (!validateTraits(traits) || !validPosition(position))
    throw new Error('표본 특징과 GPS 위치를 확인해 주세요.')
  return {
    id,
    ...traits,
    initialDryness: traits.dryness,
    region,
    position: accuracyMeters === undefined ? snap(position) : { ...position },
    ...(accuracyMeters === undefined ? {} : { accuracyMeters }),
    indoor,
    publicLocation,
    createdAt: now.toISOString(),
    lastTick: new Date(Math.ceil(now.getTime() / 3600000) * 3600000).toISOString(),
    status: 'alive',
    durability: 1,
    revision: 0,
  }
}
export function born(s: FieldSpecimen): LifeEvent {
  return {
    at: s.createdAt,
    type: 'created',
    description: 'GPS 주변 가상 바닥에 등록. 실제 착탄 지점을 측정한 위치가 아닙니다.',
    position: s.position,
  }
}
export function validWeather(w: FieldWeather) {
  return (
    Number.isFinite(Date.parse(w.time)) &&
    [w.temperature, w.humidity, w.precipitation, w.windSpeed, w.windDirection].every(
      Number.isFinite,
    ) &&
    w.temperature >= -100 &&
    w.temperature <= 70 &&
    w.humidity >= 0 &&
    w.humidity <= 100 &&
    w.precipitation >= 0 &&
    w.precipitation <= 1000 &&
    w.windSpeed >= 0 &&
    w.windSpeed <= 150 &&
    w.windDirection >= 0 &&
    w.windDirection <= 360
  )
}
/** Explicit game rules v1. Observed/model weather is an input, never evidence of real booger physics. */
export function simulateHour(
  s: FieldSpecimen,
  weather: FieldWeather,
  now = Date.now(),
): { specimen: FieldSpecimen; event: LifeEvent } | null {
  const time = Date.parse(weather.time)
  if (
    s.status !== 'alive' ||
    !validWeather(weather) ||
    time <= Date.parse(s.lastTick) ||
    time > now ||
    time % 3600000 !== 0
  )
    return null
  // Do not skip unavailable hours: those hours are retried when weather becomes available.
  if (time - Date.parse(s.lastTick) !== 3600000) return null
  const next = {
    ...s,
    position: { ...s.position },
    lastTick: weather.time,
    revision: s.revision + 1,
  }
  let type: LifeEvent['type'] = 'weather',
    description = '가상 게임 규칙 v1: 실제 기상 입력으로 상태를 계산했습니다.'
  if (s.indoor)
    description =
      '실내 표본: 실내 기상이 없으므로 외부 강수·바람·온습도 효과를 적용하지 않았습니다.'
  else {
    const dryDelta =
      weather.humidity < 45 && weather.temperature >= 15
        ? 0.25
        : weather.humidity > 80 || weather.precipitation > 0
          ? -0.25
          : 0
    next.dryness = Math.max(1, Math.min(5, s.dryness + dryDelta))
    const resistance = s.size === 'small' ? 1 : s.size === 'medium' ? 1.5 : 2
    next.durability = Math.max(0, s.durability - (weather.precipitation * 0.12) / resistance)
    if (next.durability <= 0) {
      next.status = 'dissolved'
      type = 'dissolved'
      description = '가상 게임 규칙 v1: 강수 누적으로 소멸했습니다. 생애 기록은 남습니다.'
    } else if (weather.windSpeed >= 8 && next.dryness >= 4) {
      const meters = Math.min(25, (weather.windSpeed * (next.dryness - 3)) / resistance)
      // Open-Meteo direction is where wind comes FROM; travel in the opposite direction.
      next.position = move(s.position, meters, (weather.windDirection + 180) % 360)
      type = 'moved'
      description = `가상 게임 규칙 v1: 바람에 약 ${Math.round(meters)}m 이동했습니다. GPS 지도상의 가상 이동이며 실제 재부착이 아닙니다.`
    }
  }
  return {
    specimen: next,
    event: { at: weather.time, type, description, position: next.position, weather },
  }
}
