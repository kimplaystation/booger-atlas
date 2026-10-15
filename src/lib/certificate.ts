import { COLORS, SIZES, validateObservation } from './domain'
import type { Color, Size, Observation, Region } from './domain'

export interface Certificate {
  version: 1
  observation: Observation
  region: Pick<Region, 'id' | 'name' | 'admin1' | 'country'>
  mode: 'demo' | 'shared'
}
const hues: Record<Color, { code: string; name: string }> = {
  'light-yellow': { code: 'LY', name: '연한 황금빛' },
  yellow: { code: 'YL', name: '황금빛' },
  brown: { code: 'BR', name: '대지빛' },
  'dark-brown': { code: 'DB', name: '심층 갈색' },
  green: { code: 'GN', name: '이끼빛' },
  black: { code: 'BK', name: '흑요빛' },
  other: { code: 'OT', name: '오묘한' },
}
const scales: Record<Size, { code: string; name: string; comment: string }> = {
  small: {
    code: 'S',
    name: '미세 입자형',
    comment: '작다고 무시하지 마세요. 서류는 똑같이 한 장입니다.',
  },
  medium: {
    code: 'M',
    name: '표준 암편형',
    comment: '한 치의 과장도 없이, 코에서 나온 한 점입니다.',
  },
  large: {
    code: 'L',
    name: '대형 암괴형',
    comment: '존재감이 확실합니다. 전시대는 각자 준비해 주세요.',
  },
}
export const DRY_NAMES = [
  '촉촉한 점토암',
  '말랑한 퇴적암',
  '담백한 지층암',
  '바삭한 풍화암',
  '메마른 사막암',
] as const
export const DRY_LABELS = ['촉촉함', '조금 촉촉함', '보통', '건조함', '매우 건조함'] as const
/** Versioned, exhaustive input rules. No rarity, scores, random names or scientific inference. */
export function classify(o: Pick<Observation, 'color' | 'size' | 'dryness'>) {
  if (
    !hues[o.color] ||
    !scales[o.size] ||
    !Number.isInteger(o.dryness) ||
    o.dryness < 1 ||
    o.dryness > 5
  )
    throw new Error('분류할 특징을 확인해 주세요.')
  return {
    code: `BA1-${hues[o.color].code}-${scales[o.size].code}-D${o.dryness}`,
    name: `${hues[o.color].name} ${DRY_NAMES[o.dryness - 1]}`,
    subtype: scales[o.size].name,
    comment: scales[o.size].comment,
    color: COLORS.find((c) => c.id === o.color)!,
    size: SIZES.find((s) => s.id === o.size)!,
    dryness: DRY_LABELS[o.dryness - 1],
  }
}
export function makeCertificate(o: Observation, region: Region, demo: boolean): Certificate {
  return {
    version: 1,
    observation: { ...o },
    region: { id: region.id, name: region.name, admin1: region.admin1, country: region.country },
    mode: demo ? 'demo' : 'shared',
  }
}
export function regionLabel(c: Certificate) {
  return [c.region.country, c.region.admin1, c.region.name].filter(Boolean).join(' · ')
}
// Explicit allowlist: share only coarse administrative names and selected traits, never coordinates.
export function encodeCertificate(c: Certificate): string {
  const { id, regionId, date, color, size, dryness } = c.observation
  const payload = {
    version: 1,
    observation: { id, regionId, date, color, size, dryness },
    region: {
      id: c.region.id,
      name: c.region.name,
      admin1: c.region.admin1,
      country: c.region.country,
    },
    mode: c.mode,
  }
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
export function decodeCertificate(token: string): Certificate | null {
  if (token.length > 4500 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  try {
    const c = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), (x) => x.charCodeAt(0)),
      ),
    )
    const text = (x: unknown, empty = false) =>
      typeof x === 'string' &&
      (empty || x.trim().length > 0) &&
      x.length <= 100 &&
      !/[\u0000-\u001f\u007f]/.test(x)
    // UTC+14 accepts a friend's valid local date across time zones.
    const latest = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10)
    if (
      c.version !== 1 ||
      !['demo', 'shared'].includes(c.mode) ||
      validateObservation(c.observation, latest) ||
      !c.region ||
      c.region.id !== c.observation.regionId ||
      !text(c.region.name) ||
      !text(c.region.country) ||
      !text(c.region.admin1, true) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        c.observation.id,
      )
    )
      return null
    return {
      version: 1,
      observation: {
        id: c.observation.id,
        regionId: c.observation.regionId,
        date: c.observation.date,
        color: c.observation.color,
        size: c.observation.size,
        dryness: c.observation.dryness,
      },
      region: {
        id: c.region.id,
        name: c.region.name,
        admin1: c.region.admin1,
        country: c.region.country,
      },
      mode: c.mode,
    }
  } catch {
    return null
  }
}
export function certificateURL(c: Certificate, base = window.location.href): string {
  const url = new URL(base)
  url.search = ''
  url.hash = `certificate=${encodeCertificate(c)}`
  return url.toString()
}
export const CERTIFICATE_NOTE =
  '입력한 특징으로 만든 재미용 분류입니다. 과학적·의학적 감정이 아닙니다.'
export const LAST_CERTIFICATE = 'booger-atlas:last-certificate:v1'
export function rememberCertificate(c: Certificate) {
  try {
    sessionStorage.setItem(LAST_CERTIFICATE, encodeCertificate(c))
  } catch {
    /* Issuance must not depend on optional browser history storage. */
  }
}
export function lastCertificate(): Certificate | null {
  try {
    const s = sessionStorage.getItem(LAST_CERTIFICATE)
    return s ? decodeCertificate(s) : null
  } catch {
    return null
  }
}
