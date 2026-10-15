import { test, expect } from '@playwright/test'
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
async function gps(page: import('@playwright/test').Page, accuracy = 12) {
  await page.addInitScript(
    ({ accuracy }) => {
      ;(window as any).__gps = 0
      ;(window as any).__alpha = 0
      ;(window as any).__sensor = true
      setInterval(() => {
        if ((window as any).__sensor)
          window.dispatchEvent(
            new DeviceOrientationEvent('deviceorientationabsolute', {
              absolute: true,
              alpha: (window as any).__alpha,
              beta: 60,
              gamma: 0,
            }),
          )
      }, 60)
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition: (success: any) => {
            ;(window as any).__watching = true
            ;(window as any).__gpsUpdate = success
            success({
              timestamp: Date.now(),
              coords: { latitude: 37.517212345, longitude: 127.047312345, accuracy },
            })
            return 7
          },
          clearWatch: () => {
            ;(window as any).__watching = false
          },
          getCurrentPosition: (success: any) => {
            ;(window as any).__gps++
            success({
              timestamp: Date.now(),
              coords: { latitude: 37.517212345, longitude: 127.047312345, accuracy },
            })
          },
        },
      })
    },
    { accuracy },
  )
  await page.route('**/external/forecast/v1/forecast**', (r) =>
    r.fulfill({
      json: {
        current: {
          time: '2026-10-15T12:00',
          temperature_2m: 22,
          relative_humidity_2m: 70,
          precipitation: 0,
          wind_speed_10m: 4,
          wind_direction_10m: 180,
          weather_code: 2,
        },
      },
    }),
  )
  await page.route('**/external/nominatim/reverse**', (r) => r.fulfill({ json: boundary }))
  await page.route('**/external/nominatim/lookup**', (r) => r.fulfill({ json: [boundary] }))
}
test('카메라 발사 → 정밀 GPS 저장 → 재방문 방향 추적 → 같은 지도 기상', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await gps(page)
  await page.goto('/#field')
  expect(await page.evaluate(() => (window as any).__gps)).toBe(0)
  await page.getByRole('button', { name: 'GPS로 현재 지역 확인' }).click()
  await expect(page.locator('.selected-region')).toContainText('강남구')
  await page.getByLabel('코딱지 색상').selectOption('light-yellow')
  await page.getByRole('checkbox', { name: 'GPS 주변 위치를' }).check()
  await page.getByRole('button', { name: '카메라 켜고 튕기기' }).click()
  await expect(page.getByLabel('후면 카메라 영상')).toBeVisible()
  await expect(page.getByRole('button', { name: '튕기기', exact: true })).toBeEnabled()
  await expect(page.getByText('카메라 오버레이 · 가상 바닥 연출')).toBeVisible()
  const box = await page.getByTestId('camera-stage').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  expect(box.width).toBeGreaterThan(300)
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.35, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByText('튕기기 완료!', { exact: false })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.camera-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: 'GPS 주변에 저장', exact: true }).click()
  await expect(page.getByRole('heading', { name: '아직 살아 있는 작은 발견.' })).toBeVisible()
  const raw = await page.evaluate(() => localStorage.getItem('booger-atlas:field-demo:v1')!)
  const stored = JSON.parse(raw).specimens[0]
  expect(stored.accuracyMeters).toBe(12)
  // A northward virtual throw is saved two metres ahead, without the old 20m snapping.
  expect(stored.position.latitude).toBeGreaterThan(37.517212345)
  expect(stored.position.latitude - 37.517212345).toBeLessThan(0.00003)
  expect(JSON.parse(raw).specimens).toHaveLength(1)
  await expect(page.getByText('개별 위치 비공개', { exact: false }).first()).not.toBeVisible()
  await page.getByRole('button', { name: '이 브라우저용 링크 복사' }).click()
  const url = await page.getByRole('textbox', { name: '코딱지 공유 링크' }).inputValue()
  expect(url).toContain('#specimen=')
  expect(url).not.toContain('latitude')
  expect(url).not.toContain('ownerKey')
  await page.reload()
  await expect(page.getByRole('heading', { name: '아직 살아 있는 작은 발견.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'GPS 표본 지도' })).toBeVisible()
  await expect(page.locator('.saved-coordinate')).toContainText('오차 약 12m')
  await expect(page.getByLabel('지도 위치의 기상정보')).toContainText('22°C')
  await expect(page.getByLabel('지도 위치의 기상정보')).toContainText('4m/s')
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute(
    'src',
    /external\/tiles\/18\//,
  )
  await page.getByRole('button', { name: '저장 위치를 카메라로 보기' }).click()
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'true')
  await expect(page.getByRole('button', { name: '튕기기', exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    ;(window as any).__alpha = 180
  })
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'false')
  await page.evaluate(() => {
    ;(window as any).__alpha = 0
  })
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'true')
  await page.screenshot({ path: `test-results/${testInfo.project.name}-gps-camera.png` })
  await page.evaluate(() =>
    (window as any).__gpsUpdate({
      timestamp: Date.now(),
      coords: { latitude: 37.517212345, longitude: 127.0475, accuracy: 12 },
    }),
  )
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'false')
  await expect(page.locator('.direction-hint')).toContainText('왼쪽 방향')
  await page.evaluate(() =>
    (window as any).__gpsUpdate({
      timestamp: Date.now(),
      coords: { latitude: 37.517212345, longitude: 127.047312345, accuracy: 12 },
    }),
  )
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'true')
  await page.getByRole('button', { name: '카메라 닫기' }).click()
  expect(await page.evaluate(() => (window as any).__watching)).toBe(false)
  await page.evaluate(() => {
    ;(window as any).__sensor = false
  })
  await page.getByRole('button', { name: '저장 위치를 카메라로 보기' }).click()
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'false')
  await expect(page.getByText('방향 센서를 허용하고 휴대폰을 세워주세요')).toBeVisible()
  await page.getByRole('button', { name: '카메라 닫기' }).click()
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-field-detail.png`,
    fullPage: true,
  })
  await page.evaluate(() => {
    ;(window as any).__sensor = true
  })
  await page.goto('/#field')
  await page.getByRole('button', { name: 'GPS로 현재 지역 확인' }).click()
  await expect(page.locator('.selected-region')).toContainText('강남구')
  await page.getByRole('button', { name: '근처 발견', exact: true }).click()
  await page.getByRole('button', { name: '근처 코딱지 찾기' }).click()
  await expect(page.locator('.nearby-results article')).toHaveCount(1)
  await expect(page.locator('.nearby-results')).toContainText('연노랑')
  await page.getByRole('button', { name: '카메라에서 보기' }).click()
  await expect(page.getByTestId('camera-stage')).toHaveAttribute('data-target-in-view', 'true')
  await page.getByRole('button', { name: '카메라 닫기' }).click()
  expect(
    JSON.parse(await page.evaluate(() => localStorage.getItem('booger-atlas:field-demo:v1')!))
      .specimens,
  ).toHaveLength(1)
  expect(errors).toEqual([])
})
test('GPS 거부·오차 및 카메라 거부를 성공으로 표시하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_s: any, e: any) => e({ code: 1 }) },
    })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    })
  })
  await page.goto('/#field')
  await page.getByRole('button', { name: 'GPS로 현재 지역 확인' }).click()
  await expect(page.getByRole('alert')).toContainText('GPS 권한이 거부')
  await page.getByRole('button', { name: '카메라 켜고 튕기기' }).click()
  await expect(page.locator('.camera-overlay').getByRole('alert')).toContainText(
    '카메라 권한이 거부',
  )
  await page.getByRole('button', { name: '카메라 닫기' }).click()
  await expect(page.getByRole('button', { name: 'GPS 주변에 저장', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'GPS 없이 지역별 표본 기록하기' }).click()
  await expect(page.getByRole('heading', { name: '어디서 발견하셨나요?' })).toBeVisible()
})
test('GPS 오차 100m 초과는 안내하고 근처 조회를 제한한다', async ({ page }) => {
  await gps(page, 150)
  await page.goto('/#field')
  await page.getByRole('button', { name: 'GPS로 현재 지역 확인' }).click()
  await expect(page.locator('.gps-warning')).toContainText('150m')
  await expect(page.locator('.selected-region')).toContainText('강남구')
  await page.getByRole('button', { name: '근처 발견', exact: true }).click()
  await page.getByRole('button', { name: '근처 코딱지 찾기' }).click()
  await expect(page.getByRole('alert')).toContainText('100m')
  expect(await page.evaluate(() => localStorage.getItem('booger-atlas:field-demo:v1'))).toBeNull()
})
test('감정서 PNG 다운로드와 친구 링크는 기록을 추가하지 않는다', async ({ page }, testInfo) => {
  await page.goto('/#record')
  await page.getByRole('button', { name: 'GPS 사용하지 않고 직접 선택' }).click()
  await page.getByRole('button', { name: '강남구', exact: true }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('button', { name: '노란색', exact: true }).click()
  await page.getByRole('button', { name: '소형', exact: false }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(850)
  await page.getByRole('button', { name: '표본 등록하고 감정서 받기' }).click()
  await expect(
    page.getByRole('heading', { name: '당신의 코딱지에 이름이 생겼습니다.' }),
  ).toBeVisible({ timeout: 10000 })
  const d = page.waitForEvent('download')
  await page.getByRole('link', { name: '감정서 이미지 다운로드' }).click()
  const download = await d
  expect(download.suggestedFilename()).toMatch(/\.png$/)
  await download.saveAs(`test-results/${testInfo.project.name}-certificate.png`)
  await page.getByRole('button', { name: '감정서 링크 복사' }).click()
  const link = await page.getByRole('textbox', { name: '감정서 공유 링크' }).inputValue()
  await page.goto(link)
  await expect(page.getByRole('heading', { name: '이 표본, 어떻게 생각하세요?' })).toBeVisible()
  expect(
    JSON.parse(await page.evaluate(() => localStorage.getItem('booger-atlas:demo:v1')!))
      .observations,
  ).toHaveLength(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-certificate-page.png`,
    fullPage: true,
  })
})
