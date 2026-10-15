import { describe, expect, it } from 'vitest'
import { COLORS, SIZES, SEED_REGIONS } from '../src/lib/domain'
import {
  classify,
  decodeCertificate,
  encodeCertificate,
  makeCertificate,
} from '../src/lib/certificate'
const observation = {
  id: '00000000-0000-4000-8000-000000000001',
  regionId: SEED_REGIONS[0].id,
  date: '2020-01-01',
  color: 'yellow' as const,
  size: 'small' as const,
  dryness: 4,
}
describe('정직하고 일관된 공유 감정서', () => {
  it('7색 × 3크기 × 5건조도를 결정적으로 분류한다', () => {
    const codes = new Set()
    for (const c of COLORS)
      for (const s of SIZES)
        for (let d = 1; d <= 5; d++) {
          const input = { color: c.id, size: s.id, dryness: d }
          expect(classify(input)).toEqual(classify(input))
          codes.add(classify(input).code)
        }
    expect(codes.size).toBe(105)
  })
  it('한국어 공유 내용을 왕복하고 좌표나 임의 필드는 제거한다', () => {
    const c = makeCertificate(observation, SEED_REGIONS[0], true)
    Object.assign(c.region, { latitude: 37.1234567, address: 'private' })
    const token = encodeCertificate(c),
      decoded = decodeCertificate(token)!
    expect(decoded.region.name).toBe(SEED_REGIONS[0].name)
    expect(decoded.region).not.toHaveProperty('latitude')
    expect(decoded.region).not.toHaveProperty('address')
    expect(decoded.mode).toBe('demo')
  })
  it('손상된 링크·잘못된 날짜·가짜 특징을 거부한다', () => {
    expect(decodeCertificate('not/a/certificate')).toBeNull()
    expect(decodeCertificate('A'.repeat(5000))).toBeNull()
    const c = makeCertificate({ ...observation, date: '2099-01-01' }, SEED_REGIONS[0], true)
    expect(decodeCertificate(encodeCertificate(c))).toBeNull()
    expect(() => classify({ ...observation, dryness: 0 })).toThrow()
  })
})
