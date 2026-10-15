import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from '@playwright/test'
const server = spawn('npm', ['run', 'preview', '--', '--port', '4173'], {
  detached: true,
  stdio: 'ignore',
})
let browser
try {
  let ready = false
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:4173')
      if (r.ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) throw Error('Production preview did not start')
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: [
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:4173/#record')
  await page.getByRole('button', { name: 'GPS 사용하지 않고 직접 선택' }).click()
  await page.getByRole('button', { name: '강남구', exact: true }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('button', { name: '노란색', exact: true }).click()
  await page.getByRole('button', { name: '소형', exact: false }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(850)
  await page.getByRole('button', { name: '표본 등록하고 감정서 받기', exact: true }).click()
  await page.getByRole('heading', { name: '당신의 코딱지에 이름이 생겼습니다.' }).waitFor()
  const count = await page.evaluate(
    () => JSON.parse(localStorage.getItem('booger-atlas:demo:v1')).observations.length,
  )
  await page.goto('http://127.0.0.1:4173/#field')
  await page.getByRole('button', { name: '카메라 켜고 튕기기' }).click()
  await page.waitForFunction(() => !document.querySelector('.camera-bottom .primary')?.disabled)
  await page.getByRole('button', { name: '튕기기', exact: true }).click()
  await page.getByText('튕기기 완료!', { exact: false }).waitFor()
  if (count !== 1 || errors.length) throw Error(JSON.stringify({ count, errors }))
  console.log(
    'PASS: production bundle saved a demo observation, issued a certificate and rendered/fired the camera 3D overlay with a fake media device; no JavaScript errors.',
  )
} finally {
  await browser?.close()
  if (server.pid)
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {}
}
