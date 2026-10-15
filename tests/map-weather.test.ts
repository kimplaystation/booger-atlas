import { afterEach, beforeEach, expect, it, vi } from 'vitest'
beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('location', { origin: 'http://localhost' })
})
afterEach(() => vi.unstubAllGlobals())
it('지도 날씨를 약 1km 셀로 요청하고 동시·반복 요청을 10분 캐시한다', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        current: {
          time: '2026-10-15T12:00',
          temperature_2m: 22,
          precipitation: 0,
          wind_speed_10m: 4,
          wind_direction_10m: 180,
          relative_humidity_2m: 70,
          weather_code: 2,
        },
      }),
    })
  vi.stubGlobal('fetch', fetch)
  const { currentMapWeather } = await import('../src/lib/mapWeather')
  const p = { latitude: 37.517212345, longitude: 127.047312345 }
  const [w] = await Promise.all([currentMapWeather(p), currentMapWeather(p)])
  expect(w.precipitation).toBe(0)
  expect(w.windDirection).toBe(180)
  await currentMapWeather(p)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0][0])).toContain('latitude=37.52')
  expect(String(fetch.mock.calls[0][0])).not.toContain('37.517212345')
})
it('자료 누락을 0으로 만들지 않고 장애 이후 재시도가 가능하다', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { time: '2026-10-15T12:00', temperature_2m: null, wind_speed_10m: -1 },
      }),
    })
  vi.stubGlobal('fetch', fetch)
  const { currentMapWeather } = await import('../src/lib/mapWeather')
  const p = { latitude: 37.51, longitude: 127.04 }
  await expect(currentMapWeather(p)).rejects.toThrow('offline')
  const w = await currentMapWeather(p)
  expect(w.temperature).toBeNull()
  expect(w.windSpeed).toBeNull()
  expect(w.precipitation).toBeNull()
})
