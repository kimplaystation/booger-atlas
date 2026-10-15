import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  aggregate,
  normalizeNominatim,
  summarize,
  validateObservation,
  validateFilters,
  filterCells,
  shiftDate,
  isDate,
  SEED_REGIONS,
  dailySeries,
} from '../src/lib/domain'
import type { Observation } from '../src/lib/domain'
import { fetchWeather } from '../supabase/functions/_shared/weather'
const base: Observation = {
  id: 'a',
  regionId: SEED_REGIONS[0].id,
  date: '2026-01-02',
  color: 'yellow',
  size: 'small',
  dryness: 3,
}
describe('관측 입력 검증', () => {
  it('정상 기록과 과거 날짜를 허용한다', () =>
    expect(validateObservation(base, '2026-01-03')).toBeNull())
  it.each([
    { regionId: '' },
    { regionId: '임의 지역' },
    { date: '2026-02-30' },
    { date: '2027-01-01' },
    { date: '1939-12-31' },
    { dryness: 0 },
    { dryness: 6 },
    { dryness: 2.5 },
    { color: 'pink' },
    { size: 'giant' },
  ])('잘못된 필수 값 %j을 거부한다', (patch) =>
    expect(validateObservation({ ...base, ...patch }, '2026-01-03')).not.toBeNull(),
  )
  it('윤년과 날짜 범위를 검증한다', () => {
    expect(isDate('2024-02-29')).toBe(true)
    expect(isDate('2025-02-29')).toBe(false)
    expect(validateFilters({ from: '2026-02-01', to: '2026-01-01' })).not.toBeNull()
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })
})
describe('통계는 실제 표본만 집계한다', () => {
  it('빈 집계는 0개, 평균 null이다', () => {
    const s = summarize([])
    expect(s.count).toBe(0)
    expect(s.average).toBeNull()
    expect(s.colors.every((c) => c.count === 0)).toBe(true)
  })
  it('동일 셀 합산과 가중 평균을 계산한다', () => {
    const c = aggregate([base, { ...base, id: 'b' }, { ...base, id: 'c', dryness: 5 }])
    expect(c).toHaveLength(2)
    expect(summarize(c).average).toBeCloseTo(11 / 3)
    expect(summarize(c).colors.find((x) => x.id === 'yellow')?.count).toBe(3)
    expect(dailySeries(c)[0].count).toBe(3)
  })
  it('날짜와 지역별로 분리한다', () => {
    const c = aggregate([
      base,
      { ...base, id: 'b', date: '2026-01-03' },
      { ...base, id: 'c', regionId: SEED_REGIONS[1].id },
    ])
    expect(filterCells(c, { from: '2026-01-02', to: '2026-01-02' }, base.regionId)).toHaveLength(1)
  })
})
describe('행정구역 검색', () => {
  const osm = {
    osm_type: 'relation',
    osm_id: 42,
    class: 'boundary',
    type: 'administrative',
    name: 'Example County',
    lat: '40',
    lon: '-74',
    extratags: { admin_level: '6' },
    address: { country: 'United States', country_code: 'us', state: 'New York' },
  }
  it('안정적인 OSM relation ID와 행정 대표 좌표만 추출한다', () => {
    expect(normalizeNominatim(osm)).toMatchObject({
      id: 'osm:relation:42',
      countryCode: 'US',
      latitude: 40,
    })
  })
  it('POI, 상세주소, 국가·주만 있는 결과는 제외한다', () => {
    expect(normalizeNominatim({ ...osm, osm_type: 'node' })).toBeNull()
    expect(normalizeNominatim({ ...osm, class: 'amenity' })).toBeNull()
    expect(normalizeNominatim({ ...osm, extratags: { admin_level: '4' } })).toBeNull()
  })
  it('한국 동 단위와 행정단계 미상 결과를 제외한다', () => {
    expect(
      normalizeNominatim({
        ...osm,
        name: '역삼동',
        extratags: { admin_level: '8' },
        address: { country: '대한민국', country_code: 'kr' },
      }),
    ).toBeNull()
    expect(normalizeNominatim({ ...osm, extratags: {} })).toBeNull()
  })
  it('빠른 선택과 검색 결과의 동일 지역을 통합한다', () => {
    expect(
      normalizeNominatim({
        ...osm,
        name: '강남구',
        address: { country: '대한민국', country_code: 'kr', state: '서울특별시' },
      })?.id,
    ).toBe('kr:legal:11680')
  })
})
describe('기상 연결', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('실제 0 값은 유지하고 누락값은 null로 둔다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          timezone: 'Asia/Seoul',
          daily: { time: ['2020-01-02'], temperature_2m_mean: [0], precipitation_sum: [0] },
          hourly: {
            time: ['2020-01-02T00:00', '2020-01-02T01:00'],
            relative_humidity_2m: [null, 80],
          },
        }),
      }),
    )
    const result = await fetchWeather(SEED_REGIONS[0], '2020-01-02')
    expect(result[0]).toMatchObject({
      temperature: 0,
      precipitation: 0,
      humidity: 80,
      pm25: null,
      kind: 'archive',
    })
  })
  it('과거 자료와 예보 URL을 구분한다', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ timezone: 'UTC', daily: { time: [] } }) })
    vi.stubGlobal('fetch', mock)
    await fetchWeather(SEED_REGIONS[0], '2020-01-02')
    expect(mock.mock.calls[0][0]).toContain('archive-api.open-meteo.com')
    await fetchWeather(SEED_REGIONS[0])
    expect(mock.mock.calls[1][0]).toContain('api.open-meteo.com/v1/forecast')
  })
  it('외부 API 실패를 성공한 자료로 꾸미지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchWeather(SEED_REGIONS[0], '2020-01-02')).rejects.toThrow('503')
  })
})
