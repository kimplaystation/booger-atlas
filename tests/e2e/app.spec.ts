import { test, expect } from '@playwright/test'
test.beforeEach(async ({ page }) => {
  await page.route('**/external/{forecast,archive,air}/**', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page.route('https://**.open-meteo.com/**', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  )
})
test('빈 지도, 필수 입력 검증, 기록 저장, 새로고침 유지와 지역 분석', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('이 브라우저에만 저장됩니다.', { exact: false })).toBeVisible()
  await expect(page.getByText('아직 관측된 표본이 없습니다.')).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path:not([d="M0 0"])').first()).toBeVisible()
  await page.getByRole('link', { name: '표본 등록' }).click()
  await page.getByRole('button', { name: '표본 등록하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('발견 지역')
  await page.getByRole('button', { name: '강남구', exact: true }).click()
  await page.getByRole('button', { name: '표본 등록하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('색상')
  await page.getByRole('button', { name: '노란색', exact: true }).click()
  await page.getByRole('button', { name: '소형', exact: false }).click()
  await page.getByRole('button', { name: '건조도 4단계' }).click()
  await page.waitForTimeout(850) // Respect the server's minimum form dwell time.
  await page.getByRole('button', { name: '표본 등록하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '소중한 표본이 접수되었습니다.' })).toBeVisible()
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('booger-atlas:demo:v1')!))
  expect(store.observations).toHaveLength(1)
  expect(store.observations[0]).not.toHaveProperty('latitude')
  expect(store.observations[0].regionId).toBe('kr:legal:11680')
  await page.getByRole('button', { name: '이 지역 분석 보기' }).click()
  await expect(page.getByRole('heading', { name: '코딱지 특징 분포' })).toBeVisible()
  await expect(page.getByText('분석을 위한 데이터 수집 중')).toBeVisible()
  await expect(page.getByText('기상 API에 연결하지 못했습니다. 자료 없음')).toBeVisible()
  await expect(page.locator('.analysis-stats')).toContainText('4.0')
  await page.getByRole('link', { name: '관측 지도' }).click()
  await page.reload()
  await expect(page.locator('.overview')).toContainText('4.0')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('booger-atlas:demo:v1')!).observations.length,
    ),
  ).toBe(1)
})
test('GPS 거부 후 수동 지역 선택 가능, 자동 위치 요청 없음', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).__gpsCalls = 0
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: any, error: any) => {
          ;(window as any).__gpsCalls++
          error({ code: 1 })
        },
      },
    })
  })
  await page.goto('/#record')
  expect(await page.evaluate(() => (window as any).__gpsCalls)).toBe(0)
  await page.getByRole('button', { name: 'GPS로 지역 찾기' }).click()
  await expect(page.getByRole('alert')).toContainText('위치 권한이 거부')
  await page.getByRole('button', { name: '마포구', exact: true }).click()
  await expect(page.locator('.selected-region')).toContainText('마포구')
})
test('해외 검색은 검증된 행정경계만 표시하고 API 장애를 설명한다', async ({ page }) => {
  await page.route('**/external/nominatim/search**', (route) =>
    route.fulfill({
      json: [
        {
          osm_type: 'relation',
          osm_id: 7444,
          class: 'boundary',
          type: 'administrative',
          name: 'Paris',
          lat: '48.85',
          lon: '2.35',
          extratags: { admin_level: '8' },
          address: { country: 'France', country_code: 'fr', state: 'Île-de-France' },
        },
        { osm_type: 'node', osm_id: 1, class: 'shop', type: 'supermarket', name: 'Paris Market' },
      ],
    }),
  )
  await page.goto('/#record')
  await page.getByRole('textbox', { name: '발견 지역 · 필수' }).fill('Paris')
  await page.getByRole('button', { name: '검색', exact: true }).click()
  await expect(page.locator('.search-results>button')).toHaveCount(1)
  await page.getByRole('button', { name: 'Paris France' }).click()
  await expect(page.locator('.selected-region')).toContainText('Paris')
  await page.unroute('**/external/nominatim/search**')
  await page.route('**/external/nominatim/search**', (route) => route.fulfill({ status: 503 }))
  await page.getByRole('textbox', { name: '발견 지역 · 필수' }).fill('Unknown')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '검색', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('외부 데이터 서비스')
})
test('미래 날짜와 중복 제출을 막고 날짜 필터를 적용한다', async ({ page }) => {
  await page.goto('/#record')
  await page.getByRole('button', { name: '종로구', exact: true }).click()
  await page.getByRole('button', { name: '초록색', exact: true }).click()
  await page.getByRole('button', { name: '중형', exact: false }).click()
  await page.locator('#found-date').fill('2099-01-01')
  await page.getByRole('button', { name: '표본 등록하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('날짜')
  await page.locator('#found-date').fill('2020-01-02')
  await page.waitForTimeout(850)
  await page.getByRole('button', { name: '표본 등록하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '소중한 표본이 접수되었습니다.' })).toBeVisible()
  await page.getByRole('button', { name: '관측 지도로 돌아가기' }).click()
  await expect(page.getByText('아직 관측된 표본이 없습니다.')).toBeVisible()
  await page.getByLabel('조회 시작일').fill('2020-01-01')
  await expect(page.getByText('아직 관측된 표본이 없습니다.')).not.toBeVisible()
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('booger-atlas:demo:v1')!).observations.length,
    ),
  ).toBe(1)
})
test('모바일과 PC에서 가로 넘침 없이 세 화면 렌더링', async ({ page }, testInfo) => {
  for (const hash of ['map', 'record', 'analysis']) {
    await page.goto(`/#${hash}`)
    await expect(page.locator('h1')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/')
  await page.locator('.leaflet-overlay-pane path:not([d="M0 0"])').first().waitFor()
  await page.screenshot({ path: `test-results/${testInfo.project.name}-map.png`, fullPage: true })
})

test('다른 지역과 비교하고 저장된 값만 집계한다', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'booger-atlas:demo:v1',
      JSON.stringify({
        version: 1,
        regions: [
          {
            id: 'kr:legal:11680',
            name: '강남구',
            country: '대한민국',
            countryCode: 'KR',
            admin1: '서울특별시',
            latitude: 37.5172,
            longitude: 127.0473,
            source: '테스트 전용',
          },
          {
            id: 'kr:legal:11440',
            name: '마포구',
            country: '대한민국',
            countryCode: 'KR',
            admin1: '서울특별시',
            latitude: 37.5663,
            longitude: 126.9019,
            source: '테스트 전용',
          },
        ],
        observations: [
          {
            id: 'test-a',
            regionId: 'kr:legal:11680',
            date: '2020-01-02',
            color: 'yellow',
            size: 'small',
            dryness: 2,
          },
          {
            id: 'test-b',
            regionId: 'kr:legal:11440',
            date: '2020-01-02',
            color: 'brown',
            size: 'large',
            dryness: 5,
          },
        ],
        submissions: [],
      }),
    ),
  )
  await page.goto('/#analysis')
  await page
    .locator('.analysis-controls')
    .getByRole('button', { name: '강남구', exact: true })
    .click()
  await page.getByLabel('조회 시작일').fill('2020-01-01')
  await page
    .locator('.comparison-panel')
    .getByRole('button', { name: '마포구', exact: true })
    .click()
  const table = page.locator('.comparison-panel table')
  await expect(table).toContainText('강남구')
  await expect(table).toContainText('마포구')
  await expect(table.getByRole('row').filter({ hasText: '평균 건조도' })).toContainText('2.0')
  await expect(table.getByRole('row').filter({ hasText: '평균 건조도' })).toContainText('5.0')
})

test('GPS 승인 시 행정구역 대표점만 저장하고 직접 수정할 수 있다', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: any) =>
          success({ coords: { latitude: 37.123456789, longitude: 127.987654321 } }),
      },
    }),
  )
  const boundary = {
    osm_type: 'relation',
    osm_id: 2410520,
    category: 'boundary',
    type: 'administrative',
    name: '강남구',
    lat: '37.5177',
    lon: '127.0473',
    extratags: { admin_level: '6', 'ref:KR:mois:legal': '1168000000' },
    address: { country: '대한민국', country_code: 'kr', city: '서울특별시' },
  }
  await page.route('**/external/nominatim/reverse**', (r) => r.fulfill({ json: boundary }))
  await page.route('**/external/nominatim/lookup**', (r) => r.fulfill({ json: [boundary] }))
  await page.goto('/#record')
  await page.getByRole('button', { name: 'GPS로 지역 찾기' }).click()
  await expect(page.locator('.selected-region')).toContainText('강남구')
  await page.getByRole('button', { name: '선택 지역 해제' }).click()
  await page.getByRole('button', { name: '마포구', exact: true }).click()
  await page.getByRole('button', { name: '갈색', exact: true }).click()
  await page.getByRole('button', { name: '대형', exact: false }).click()
  await page.getByRole('button', { name: '표본 등록하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '소중한 표본이 접수되었습니다.' })).toBeVisible()
  const raw = await page.evaluate(() => localStorage.getItem('booger-atlas:demo:v1')!)
  expect(raw).not.toContain('37.123456789')
  expect(raw).not.toContain('127.987654321')
  expect(JSON.parse(raw).observations[0].regionId).toBe('kr:legal:11440')
})
