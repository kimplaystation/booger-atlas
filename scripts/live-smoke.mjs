// Read-only optional validation against real providers. No observations are created.
import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173')
  const result = await page.evaluate(async () => {
    const api = await import('/src/lib/api.ts')
    const domain = await import('/src/lib/domain.ts')
    const results = {}
    for (const [label, fn] of [
      ['search', () => api.searchRegions('프랑스 파리')],
      ['forecast', () => api.getWeather(domain.SEED_REGIONS[0])],
      ['archive', () => api.getWeather(domain.SEED_REGIONS[0], '2020-01-02')],
      ['koreanRegion', () => api.searchRegions('서울 강남구')],
    ]) {
      try {
        results[label] = await fn()
      } catch (e) {
        results[label] = { error: e.message }
      }
    }
    return results
  })
  console.log(JSON.stringify(result, null, 2))
  if (Object.values(result).some((r) => r.error)) process.exitCode = 1
  if (
    !result.forecast?.length ||
    !result.archive?.length ||
    !result.search?.length ||
    result.koreanRegion?.[0]?.id !== 'kr:legal:11680'
  )
    process.exitCode = 1
} finally {
  await browser.close()
}
