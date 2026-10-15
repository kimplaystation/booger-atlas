import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  born,
  createField,
  distance,
  move,
  publicSpecimen,
  simulateHour,
  snap,
} from '../supabase/functions/_shared/field'
import type { FieldWeather } from '../supabase/functions/_shared/field'
import { SEED_REGIONS } from '../src/lib/domain'
import { readFieldDemo, saveFieldDemo } from '../src/lib/fieldDemo'
const input = {
  id: '00000000-0000-4000-8000-000000000001',
  traits: { color: 'light-yellow' as const, size: 'small' as const, dryness: 5 },
  region: SEED_REGIONS[0],
  position: { latitude: 37.517212345, longitude: 127.047312345 },
  indoor: false,
  publicLocation: false,
}
const state = () =>
  createField(
    input.id,
    input.traits,
    input.region,
    input.position,
    false,
    false,
    new Date('2026-01-01T00:00:00Z'),
  )
const weather: FieldWeather = {
  time: '2026-01-01T01:00:00.000Z',
  temperature: 25,
  humidity: 30,
  precipitation: 0,
  windSpeed: 10,
  windDirection: 0,
  source: 'TEST ONLY',
}
afterEach(() => vi.unstubAllGlobals())
describe('GPS 위치 보호와 가상 날씨 수명', () => {
  it('GPS를 저장 전에 반올림하고 공개 응답에는 비공개 위치·이력을 노출하지 않는다', () => {
    const s = state()
    expect(s.position).not.toEqual(input.position)
    expect(distance(input.position, s.position)).toBeLessThan(15)
    const p = publicSpecimen(s, [born(s)], input.position)
    expect(p.position).toBeNull()
    expect(p.events![0].position).toBeNull()
    expect(p).not.toHaveProperty('durability')
    expect(p).not.toHaveProperty('revision')
    expect(p.distanceMeters! % 10).toBe(0)
    const visible = publicSpecimen({ ...s, publicLocation: true }, [born(s)])
    expect(visible.position).toEqual(snap(s.position, 500))
    expect(visible.events![0].position).toEqual(visible.position)
  })
  it('날짜 변경선에서도 근처 거리와 이동을 계산한다', () => {
    expect(
      distance({ latitude: 0, longitude: 179.9999 }, { latitude: 0, longitude: -179.9999 }),
    ).toBeLessThan(30)
    expect(move({ latitude: 0, longitude: 179.9999 }, 50, 90).longitude).toBeLessThan(0)
  })
  it('북풍은 남쪽으로 가상 이동하고 같은 시간 재처리는 거부한다', () => {
    const next = simulateHour(state(), weather)!
    expect(next.event.type).toBe('moved')
    expect(next.specimen.position.latitude).toBeLessThan(state().position.latitude)
    expect(simulateHour(next.specimen, weather)).toBeNull()
    expect(next.event.weather).toEqual(weather)
  })
  it('강수 소멸 후 위치와 생애 사건을 보존하고 이후 날씨는 적용하지 않는다', () => {
    const next = simulateHour(state(), { ...weather, precipitation: 100 })!
    expect(next.specimen.status).toBe('dissolved')
    expect(next.event.type).toBe('dissolved')
    expect(next.event.position).toEqual(state().position)
    expect(simulateHour(next.specimen, { ...weather, time: '2026-01-01T02:00:00.000Z' })).toBeNull()
  })
  it('실내에 외부 비·바람·온습도 효과를 적용하지 않는다', () => {
    const s = { ...state(), indoor: true }
    const next = simulateHour(s, { ...weather, precipitation: 100 })!
    expect(next.specimen.position).toEqual(s.position)
    expect(next.specimen.durability).toBe(1)
    expect(next.specimen.dryness).toBe(5)
    expect(next.specimen.status).toBe('alive')
  })
  it('자료 누락·미래 기상·중간 시간 누락을 추측해서 메우지 않는다', () => {
    expect(simulateHour(state(), { ...weather, humidity: null as unknown as number })).toBeNull()
    expect(simulateHour(state(), weather, Date.parse('2026-01-01T00:30:00Z'))).toBeNull()
    expect(simulateHour(state(), { ...weather, time: '2026-01-01T02:00:00.000Z' })).toBeNull()
  })
  it('실제 기온·습도 입력으로 건조도를 제한된 범위에서 바꾸고 크기에 따라 유실이 다르다', () => {
    const s = { ...state(), dryness: 3 }
    expect(simulateHour(s, weather)!.specimen.dryness).toBe(3.25)
    expect(simulateHour(s, { ...weather, humidity: 90 })!.specimen.dryness).toBe(2.75)
    const a = simulateHour(s, { ...weather, precipitation: 2 })!,
      b = simulateHour({ ...s, size: 'large' }, { ...weather, precipitation: 2 })!
    expect(a.specimen.durability).toBeLessThan(b.specimen.durability)
  })
  it('UUID 재시도는 데모에서도 한 번만 저장하고 저장 실패를 성공으로 처리하지 않는다', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) || null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    saveFieldDemo(input)
    saveFieldDemo(input)
    expect(readFieldDemo().specimens).toHaveLength(1)
    expect([...store.values()].join()).not.toContain('37.517212345')
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw Error('quota')
      },
    })
    expect(() => saveFieldDemo(input)).toThrow('저장')
  })
})
