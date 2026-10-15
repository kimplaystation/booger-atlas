import { useEffect, useRef, useState } from 'react'
import type { Region } from '../lib/domain'
import type { FeatureCollection, Geometry } from 'geojson'

/** Orthographic globe centered on the chosen administrative region, never a personal GPS fix. */
export default function GlobeScan({ region }: { region: Region }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers = [
      setTimeout(() => setStage(1), reduced ? 0 : 750),
      setTimeout(() => setStage(2), reduced ? 0 : 1550),
    ]
    const ctx = canvas.current?.getContext('2d')
    const abort = new AbortController()
    let frame = 0,
      features: FeatureCollection['features'] = []
    void fetch(`${import.meta.env.BASE_URL}world.geojson`, { signal: abort.signal })
      .then((r) => r.json())
      .then((geo: FeatureCollection) => {
        features = geo.features
      })
      .catch(() => {})
    const start = performance.now(),
      rad = Math.PI / 180,
      R = 143
    const draw = (now: number) => {
      if (!ctx) return
      const progress = reduced ? 1 : Math.min(1, (now - start) / 1600)
      const eased = 1 - (1 - progress) ** 3
      const lon = (region.longitude - 110 * (1 - eased)) * rad,
        lat = region.latitude * rad * eased
      const project = (x: number, y: number) => {
        const l = x * rad - lon,
          p = y * rad
        return [
          R * Math.cos(p) * Math.sin(l),
          -R * (Math.cos(lat) * Math.sin(p) - Math.sin(lat) * Math.cos(p) * Math.cos(l)),
          Math.sin(lat) * Math.sin(p) + Math.cos(lat) * Math.cos(p) * Math.cos(l),
        ]
      }
      ctx.clearRect(0, 0, 360, 360)
      ctx.save()
      ctx.translate(180, 180)
      ctx.fillStyle = '#e4ebda'
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c2cfb9'
      ctx.lineWidth = 0.7
      const line = (points: number[][]) => {
        ctx.beginPath()
        let active = false
        for (const [x, y] of points) {
          const [px, py, z] = project(x, y)
          if (z <= 0) {
            active = false
            continue
          }
          if (active) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
          active = true
        }
        ctx.stroke()
      }
      for (let p = -60; p <= 60; p += 30)
        line(Array.from({ length: 181 }, (_, i) => [-180 + i * 2, p]))
      for (let l = -180; l < 180; l += 30)
        line(Array.from({ length: 91 }, (_, i) => [l, -90 + i * 2]))
      ctx.strokeStyle = '#58704f'
      ctx.lineWidth = 1
      const geometry = (g: Geometry) => {
        if (g.type === 'Polygon') g.coordinates.forEach(line)
        if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach(line))
      }
      features.forEach((f) => {
        if (f.geometry) geometry(f.geometry)
      })
      const [x, y, z] = project(region.longitude, region.latitude)
      if (z > 0) {
        ctx.strokeStyle = '#a95f3e'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, 12 + (reduced ? 0 : ((now - start) % 900) / 90), 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#a95f3e'
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      if (now - start < 2200 && !reduced) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      abort.abort()
      timers.forEach(clearTimeout)
    }
  }, [region])
  return (
    <section className="globe-scan" role="status" aria-live="polite">
      <p className="eyebrow">국제 코딱지 감정소 · 접수 중</p>
      <canvas ref={canvas} width={360} height={360} aria-hidden="true" />
      <h1>
        {
          [
            '지구에서 발견 지역을 찾는 중…',
            '코딱지의 지질학적 별명을 붙이는 중…',
            '감정서에 도장 찍을 준비 중…',
          ][stage]
        }
      </h1>
      <p className="scan-region">
        {region.country} · {region.admin1} · {region.name}
      </p>
      <p className="muted">
        선택한 행정구역으로 이동하는 연출입니다.
        <br />
        저장이 확인되면 감정서를 발급합니다.
      </p>
    </section>
  )
}
