import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ functions: { invoke: invokeMock } }),
}))
import { SEED_REGIONS } from '../src/lib/domain'
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
describe('데모와 공동 수집의 경계', () => {
  it('데모는 비어 시작하며 중복 UUID는 한 번만 저장한다', async () => {
    const api = await import('../src/lib/api')
    expect(api.DEMO).toBe(true)
    expect((await api.loadDataset()).cells).toEqual([])
    const o = {
      id: crypto.randomUUID(),
      regionId: SEED_REGIONS[0].id,
      date: '2020-01-01',
      color: 'yellow' as const,
      size: 'small' as const,
      dryness: 3,
    }
    await api.saveObservation(o, SEED_REGIONS[0], '', Date.now() - 1000)
    await api.saveObservation(o, SEED_REGIONS[0], '', Date.now() - 1000)
    expect((await api.loadDataset()).cells[0].count).toBe(1)
  })
  it('데모의 여섯 번째 기록을 거부한다', async () => {
    const api = await import('../src/lib/api')
    const o = {
      regionId: SEED_REGIONS[0].id,
      date: '2020-01-01',
      color: 'yellow' as const,
      size: 'small' as const,
      dryness: 3,
    }
    for (let i = 0; i < 5; i++)
      await api.saveObservation(
        { ...o, id: crypto.randomUUID() },
        SEED_REGIONS[0],
        '',
        Date.now() - 1000,
      )
    await expect(
      api.saveObservation(
        { ...o, id: crypto.randomUUID() },
        SEED_REGIONS[0],
        '',
        Date.now() - 1000,
      ),
    ).rejects.toThrow('10분')
  })
  it('저장 공간 오류를 등록 성공으로 처리하지 않는다', async () => {
    const api = await import('../src/lib/api')
    localStorage.setItem = () => {
      throw Error('quota')
    }
    await expect(
      api.saveObservation(
        {
          id: crypto.randomUUID(),
          regionId: SEED_REGIONS[0].id,
          date: '2020-01-01',
          color: 'yellow',
          size: 'small',
          dryness: 3,
        },
        SEED_REGIONS[0],
        '',
        Date.now() - 1000,
      ),
    ).rejects.toThrow('저장 공간')
  })
  it('Supabase 연결 실패는 로컬 저장으로 전환하지 않는다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: '데이터베이스 연결 실패' }) } },
    })
    const api = await import('../src/lib/api')
    expect(api.DEMO).toBe(false)
    await expect(api.loadDataset()).rejects.toThrow('데이터베이스 연결 실패')
    expect(localStorage.getItem('booger-atlas:demo:v1')).toBeNull()
  })
  it('동일 지역 날짜의 동시·반복 기상 요청을 캐시한다', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        timezone: 'UTC',
        daily: { time: ['2020-01-01'], temperature_2m_mean: [0], precipitation_sum: [0] },
        hourly: { time: ['2020-01-01T00:00'], relative_humidity_2m: [70] },
      }),
    })
    vi.stubGlobal('fetch', fetch)
    const api = await import('../src/lib/api')
    const results = await Promise.all([
      api.getWeather(SEED_REGIONS[0], '2020-01-01'),
      api.getWeather(SEED_REGIONS[0], '2020-01-01'),
    ])
    expect(results[0][0].humidity).toBe(70)
    await api.getWeather(SEED_REGIONS[0], '2020-01-01')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('GPS 공동 저장 실패 경계', () => {
  it('Supabase 장애를 로컬 저장 성공으로 바꾸지 않는다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-public-key')
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: 'DB 연결 실패' }) } },
    })
    const { saveField } = await import('../src/lib/fieldApi')
    await expect(
      saveField({
        id: crypto.randomUUID(),
        traits: { color: 'yellow', size: 'small', dryness: 3 },
        region: SEED_REGIONS[0],
        position: { latitude: 37.51, longitude: 127.04 },
        accuracy: 10,
        indoor: false,
        publicLocation: false,
        startedAt: Date.now() - 1000,
      }),
    ).rejects.toThrow('DB 연결 실패')
    expect(localStorage.getItem('booger-atlas:field-demo:v1')).toBeNull()
  })
})
