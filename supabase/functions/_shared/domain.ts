export const COLORS = [
  { id: 'yellow', label: '노란색', hex: '#c5a94d' },
  { id: 'brown', label: '갈색', hex: '#9a7251' },
  { id: 'dark-brown', label: '진갈색', hex: '#58463b' },
  { id: 'green', label: '초록색', hex: '#6f8158' },
  { id: 'black', label: '검은색', hex: '#303a37' },
  { id: 'other', label: '기타', hex: '#9fa8a1' },
] as const
export const SIZES = [
  { id: 'small', label: '소형', hint: '쌀알보다 작음' },
  { id: 'medium', label: '중형', hint: '쌀알 정도' },
  { id: 'large', label: '대형', hint: '쌀알보다 큼' },
] as const
export type Color = (typeof COLORS)[number]['id']
export type Size = (typeof SIZES)[number]['id']
export interface Region {
  id: string
  name: string
  country: string
  countryCode: string
  admin1: string
  latitude: number
  longitude: number
  source: string
}
export interface Observation {
  id: string
  regionId: string
  date: string
  color: Color
  size: Size
  dryness: number
}
export interface Cell {
  regionId: string
  date: string
  color: Color
  size: Size
  dryness: number
  count: number
}
export interface Dataset {
  regions: Region[]
  cells: Cell[]
}
export interface WeatherDay {
  date: string
  temperature: number | null
  humidity: number | null
  precipitation: number | null
  pm25: number | null
  pm10: number | null
  kind: 'archive' | 'recent' | 'forecast'
  fetchedAt: string
  source: string
}
export interface Filters {
  from: string
  to: string
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function isDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export function validateObservation(input: unknown, today = localDate()): string | null {
  if (!input || typeof input !== 'object') return '필수 항목을 입력해 주세요.'
  const o = input as Record<string, unknown>
  if (typeof o.regionId !== 'string' || !/^(kr:legal:\d{5}|osm:relation:\d+)$/.test(o.regionId))
    return '검색 결과에서 시·군·구에 해당하는 지역을 선택해 주세요.'
  if (!isDate(o.date) || o.date < '1940-01-01' || o.date > today)
    return '발견 날짜는 1940년 1월 1일부터 오늘까지 선택할 수 있습니다.'
  if (!COLORS.some((c) => c.id === o.color)) return '색상을 선택해 주세요.'
  if (!SIZES.some((s) => s.id === o.size)) return '크기를 선택해 주세요.'
  if (!Number.isInteger(o.dryness) || Number(o.dryness) < 1 || Number(o.dryness) > 5)
    return '건조도는 1~5단계로 선택해 주세요.'
  return null
}
export function validateFilters(f: Filters): string | null {
  return !isDate(f.from) || !isDate(f.to) || f.from > f.to
    ? '조회 시작일과 종료일을 확인해 주세요.'
    : null
}
export function filterCells(cells: Cell[], filters: Filters, regionId?: string): Cell[] {
  return cells.filter(
    (c) => c.date >= filters.from && c.date <= filters.to && (!regionId || c.regionId === regionId),
  )
}
export function summarize(cells: Cell[]) {
  const count = cells.reduce((s, c) => s + c.count, 0)
  return {
    count,
    average: count ? cells.reduce((s, c) => s + c.dryness * c.count, 0) / count : null,
    colors: COLORS.map((c) => ({
      ...c,
      count: cells.filter((x) => x.color === c.id).reduce((s, x) => s + x.count, 0),
    })),
    sizes: SIZES.map((s) => ({
      ...s,
      count: cells.filter((x) => x.size === s.id).reduce((n, x) => n + x.count, 0),
    })),
  }
}
export function dailySeries(cells: Cell[]) {
  return [...new Set(cells.map((c) => c.date))]
    .sort()
    .map((date) => ({ date, ...summarize(cells.filter((c) => c.date === date)) }))
}
export function aggregate(observations: Observation[]): Cell[] {
  const groups = new Map<string, Cell>()
  for (const o of observations) {
    const key = [o.regionId, o.date, o.color, o.size, o.dryness].join('|')
    const c = groups.get(key)
    if (c) c.count++
    else
      groups.set(key, {
        regionId: o.regionId,
        date: o.date,
        color: o.color,
        size: o.size,
        dryness: o.dryness,
        count: 1,
      })
  }
  return [...groups.values()]
}
// These are administrative reference points, never a participant's GPS coordinates.
// Official Korean legal-dong city/county/district code prefixes: code.go.kr.
export const SEED_REGIONS: Region[] = [
  {
    id: 'kr:legal:11680',
    name: '강남구',
    country: '대한민국',
    countryCode: 'KR',
    admin1: '서울특별시',
    latitude: 37.5172,
    longitude: 127.0473,
    source: '행정표준코드 · 법정동 시군구 코드',
  },
  {
    id: 'kr:legal:11440',
    name: '마포구',
    country: '대한민국',
    countryCode: 'KR',
    admin1: '서울특별시',
    latitude: 37.5663,
    longitude: 126.9019,
    source: '행정표준코드 · 법정동 시군구 코드',
  },
  {
    id: 'kr:legal:11110',
    name: '종로구',
    country: '대한민국',
    countryCode: 'KR',
    admin1: '서울특별시',
    latitude: 37.573,
    longitude: 126.9794,
    source: '행정표준코드 · 법정동 시군구 코드',
  },
  {
    id: 'kr:legal:26350',
    name: '해운대구',
    country: '대한민국',
    countryCode: 'KR',
    admin1: '부산광역시',
    latitude: 35.1631,
    longitude: 129.1635,
    source: '행정표준코드 · 법정동 시군구 코드',
  },
  {
    id: 'kr:legal:50110',
    name: '제주시',
    country: '대한민국',
    countryCode: 'KR',
    admin1: '제주특별자치도',
    latitude: 33.4996,
    longitude: 126.5312,
    source: '행정표준코드 · 법정동 시군구 코드',
  },
]
export function canonicalRegion(r: Region): Region {
  return (
    SEED_REGIONS.find(
      (s) =>
        r.countryCode === 'KR' &&
        r.name === s.name &&
        (r.admin1.includes(s.admin1.slice(0, 2)) || (s.admin1.includes(r.admin1) && !!r.admin1)),
    ) ?? r
  )
}
export function normalizeNominatim(raw: Record<string, unknown>): Region | null {
  const address = (raw.address || {}) as Record<string, string>
  const extras = (raw.extratags || {}) as Record<string, string>
  const level = Number(extras.admin_level)
  const category = raw.class || raw.category
  if (
    raw.osm_type !== 'relation' ||
    category !== 'boundary' ||
    raw.type !== 'administrative' ||
    !Number.isFinite(level) ||
    (level < 6 && !(level === 5 && raw.addresstype === 'city' && address.country_code !== 'kr')) ||
    level > 8
  )
    return null
  const countryCode = address.country_code?.toUpperCase()
  if (!countryCode || !address.country || !raw.name || !/^\d+$/.test(String(raw.osm_id)))
    return null
  const name = String(raw.name)
  // Korea: only si/gun/gu, never eup/myeon/dong or province-only results.
  if (countryCode === 'KR' && (!/[시군구]$/.test(name) || ![6, 7, 8].includes(level))) return null
  const latitude = Number(raw.lat),
    longitude = Number(raw.lon)
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null
  const legal = countryCode === 'KR' ? extras['ref:KR:mois:legal'] : undefined
  const id =
    legal && /^\d{5}00000$/.test(legal)
      ? `kr:legal:${legal.slice(0, 5)}`
      : `osm:relation:${raw.osm_id}`
  return canonicalRegion({
    id,
    name,
    country: address.country,
    countryCode,
    admin1:
      address.state ||
      address.province ||
      address.region ||
      (address.city !== name ? address.city : '') ||
      '',
    latitude,
    longitude,
    source: `OpenStreetMap · 행정경계 level ${level}`,
  })
}
