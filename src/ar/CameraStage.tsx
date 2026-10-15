import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Camera, Crosshair, X } from 'lucide-react'
import { COLORS } from '../lib/domain'
import type { Traits } from '../lib/fieldApi'

/** WebXR hit-test anchors are session-only; GPS persistence never claims a surface pose. */
export default function CameraStage({
  traits,
  discovery = false,
  approxBearing,
  onLanded,
  onClose,
}: {
  traits: Traits
  discovery?: boolean
  approxBearing?: number
  onLanded: () => void
  onClose: () => void
}) {
  const host = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLDivElement>(null)
  const engine = useRef<{ fire: () => void; startXR: () => Promise<void> } | null>(null)
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [mode, setMode] = useState<'overlay' | 'xr'>('overlay'),
    [xrSupported, setXRSupported] = useState(false),
    [hit, setHit] = useState(false),
    [fired, setFired] = useState(false),
    [heading, setHeading] = useState<number | null>(null)
  const callback = useRef(onLanded),
    traitsRef = useRef(traits)
  callback.current = onLanded
  useEffect(() => {
    let stream: MediaStream | undefined,
      renderer: THREE.WebGLRenderer | undefined,
      session: XRSession | undefined,
      source: XRHitTestSource | undefined,
      sourceSession: XRSession | undefined,
      disposed = false
    let gyro: ((e: DeviceOrientationEvent) => void) | undefined
    const abort = new AbortController()
    let down: { x: number; y: number } | null = null,
      firing = false,
      firedOnce = false,
      began = 0
    const start = new THREE.Vector3(),
      end = new THREE.Vector3(),
      camPos = new THREE.Vector3(),
      camQ = new THREE.Quaternion()
    const init = async () => {
      try {
        if (!window.isSecureContext)
          throw Error('카메라는 HTTPS 주소 또는 localhost에서만 사용할 수 있습니다.')
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error('카메라를 지원하지 않는 브라우저입니다. Safari 또는 Chrome에서 열어 주세요.')
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.current!.srcObject = stream
        await video.current!.play()
        const scene = new THREE.Scene(),
          camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
        camera.position.set(0, 1.3, 0)
        camera.rotation.x = -0.4
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
        renderer.xr.enabled = true
        host.current!.appendChild(renderer.domElement)
        scene.add(new THREE.HemisphereLight(0xfff5da, 0x52683b, 2.6))
        const light = new THREE.DirectionalLight(0xffffff, 2)
        light.position.set(1, 3, 2)
        scene.add(light)
        const t = traitsRef.current,
          c = COLORS.find((c) => c.id === t.color)!
        const geometry = new THREE.IcosahedronGeometry(1, 3),
          positions = geometry.getAttribute('position')
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i),
            f = 1 + 0.12 * Math.sin(p.x * 13 + p.y * 8) * Math.cos(p.z * 11)
          positions.setXYZ(i, p.x * f, p.y * f, p.z * f)
        }
        geometry.computeVertexNormals()
        const material = new THREE.MeshStandardMaterial({
          color: c.hex,
          roughness: 0.18 + t.dryness * 0.15,
          metalness: 0,
        })
        const booger = new THREE.Mesh(geometry, material),
          size = t.size === 'small' ? 0.038 : t.size === 'medium' ? 0.062 : 0.09
        booger.scale.set(size, size * (0.5 + t.dryness * 0.07), size * 0.8)
        booger.visible = false
        scene.add(booger)
        const reticle = new THREE.Mesh(
          new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xdce8a3, side: THREE.DoubleSide }),
        )
        reticle.matrixAutoUpdate = false
        reticle.visible = false
        scene.add(reticle)
        const marker = new THREE.Mesh(
          new THREE.CircleGeometry(0.12, 32).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: 0x91a86b,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
          }),
        )
        marker.position.set(0, 0.005, -2)
        scene.add(marker)
        const resize = () => {
          if (!renderer || !host.current || renderer.xr.isPresenting) return
          const r = host.current.getBoundingClientRect()
          renderer.setSize(r.width, r.height)
          camera.aspect = r.width / r.height
          camera.updateProjectionMatrix()
        }
        const ro = new ResizeObserver(resize)
        ro.observe(host.current!)
        abort.signal.addEventListener('abort', () => ro.disconnect())
        resize()
        const fire = () => {
          if (firing || firedOnce || !renderer) return
          if (renderer.xr.isPresenting && !reticle.visible) {
            setError('평면을 아직 찾지 못했습니다. 카메라로 바닥을 천천히 비춰주세요.')
            return
          }
          setError('')
          firing = true
          firedOnce = true
          setFired(true)
          began = performance.now()
          const active = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera
          active.getWorldPosition(camPos)
          active.getWorldQuaternion(camQ)
          start.set(0.12, -0.15, -0.3).applyQuaternion(camQ).add(camPos)
          if (renderer.xr.isPresenting) end.setFromMatrixPosition(reticle.matrix)
          else end.set(0, 0, -2)
          booger.position.copy(start)
          booger.visible = true
          marker.position.copy(end)
          marker.position.y += 0.003
        }
        engine.current = {
          fire,
          startXR: async () => {
            if (!navigator.xr) throw Error('이 브라우저는 WebXR 평면 인식을 지원하지 않습니다.')
            stream?.getTracks().forEach((t) => t.stop())
            try {
              session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: overlay.current! },
              })
              if (disposed) {
                await session.end()
                return
              }
              renderer!.xr.setReferenceSpaceType('local')
              await renderer!.xr.setSession(session)
              setMode('xr')
              marker.visible = false
              booger.visible = false
              firedOnce = false
              setFired(false)
              const view = await session.requestReferenceSpace('viewer')
              source = await session.requestHitTestSource?.({ space: view })
              sourceSession = session
              session.addEventListener('select', fire)
              session.addEventListener('end', () => {
                source?.cancel()
                source = undefined
                if (!disposed) {
                  setMode('overlay')
                  setReady(false)
                  setError('평면 인식을 종료했습니다. 카메라를 닫고 다시 열어 주세요.')
                }
              })
            } catch (e) {
              void session?.end()
              setReady(false)
              throw e
            }
          },
        }
        renderer.setAnimationLoop((_, frame) => {
          if (disposed || !renderer) return
          if (frame && source && sourceSession === renderer.xr.getSession()) {
            const space = renderer.xr.getReferenceSpace(),
              results = frame.getHitTestResults(source)
            const pose = space && results[0]?.getPose(space)
            reticle.visible = !!pose
            if (pose) reticle.matrix.fromArray(pose.transform.matrix)
            setHit(Boolean(pose))
          }
          if (firing) {
            const p = Math.min(1, (performance.now() - began) / 850)
            booger.position.lerpVectors(start, end, p)
            booger.position.y += Math.sin(p * Math.PI) * 0.48
            booger.rotation.set(p * 5, p * 7, 0)
            if (p === 1) {
              firing = false
              booger.position.y += size * 0.35
              booger.scale.y *= 0.55 + (t.dryness / 5) * 0.3
              callback.current()
            }
          }
          renderer.render(scene, camera)
        })
        const element = host.current!
        element.addEventListener(
          'pointerdown',
          (e) => {
            down = { x: e.clientX, y: e.clientY }
            element.setPointerCapture(e.pointerId)
          },
          { signal: abort.signal },
        )
        element.addEventListener(
          'pointerup',
          (e) => {
            if (down && down.y - e.clientY >= 40 && Math.abs(e.clientX - down.x) < 200) fire()
            down = null
          },
          { signal: abort.signal },
        )
        element.addEventListener(
          'pointercancel',
          () => {
            down = null
          },
          { signal: abort.signal },
        )
        abort.signal.addEventListener('abort', () => {
          geometry.dispose()
          material.dispose()
          reticle.geometry.dispose()
          reticle.material.dispose()
          marker.geometry.dispose()
          marker.material.dispose()
        })
        setReady(true)
        void navigator.xr
          ?.isSessionSupported('immersive-ar')
          .then((s) => {
            if (!disposed) setXRSupported(s)
          })
          .catch(() => {})
      } catch (e) {
        if (!disposed)
          setError(
            e instanceof DOMException && e.name === 'NotAllowedError'
              ? '카메라 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 지역 표본 기록을 이용해 주세요.'
              : e instanceof Error
                ? e.message
                : '카메라를 시작하지 못했습니다.',
          )
      }
    }
    void init()
    const hidden = () => {
      if (document.hidden) {
        stream?.getTracks().forEach((t) => t.stop())
        void session?.end()
        setReady(false)
        setError('카메라를 중지했습니다. 다시 사용하려면 닫은 뒤 열어주세요.')
      }
    }
    document.addEventListener('visibilitychange', hidden)
    gyro = (e) => {
      const d = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number
        webkitCompassAccuracy?: number
      }
      if (
        typeof d.webkitCompassHeading === 'number' &&
        (d.webkitCompassAccuracy ?? -1) >= 0 &&
        (d.webkitCompassAccuracy ?? 100) <= 30
      )
        setHeading(Math.round(d.webkitCompassHeading))
      else if (e.absolute && typeof e.alpha === 'number')
        setHeading(Math.round((360 - e.alpha) % 360))
    }
    window.addEventListener('deviceorientation', gyro)
    return () => {
      disposed = true
      abort.abort()
      document.removeEventListener('visibilitychange', hidden)
      if (gyro) window.removeEventListener('deviceorientation', gyro)
      stream?.getTracks().forEach((t) => t.stop())
      source?.cancel()
      void session?.end()
      renderer?.setAnimationLoop(null)
      renderer?.dispose()
      renderer?.domElement.remove()
      engine.current = null
    }
  }, [])
  async function requestDirection() {
    try {
      const event = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<string>
      }
      if (event.requestPermission && (await event.requestPermission()) !== 'granted')
        setError('방향 권한이 없습니다. 가까운 가상 바닥에 표시합니다.')
    } catch {
      setError('방향 센서를 사용할 수 없습니다. 가까운 가상 바닥에 표시합니다.')
    }
  }
  const directionDelta =
    heading !== null && approxBearing !== undefined
      ? ((approxBearing - heading + 540) % 360) - 180
      : null
  return (
    <div className="camera-overlay" ref={overlay}>
      <div className="camera-stage" ref={host} data-testid="camera-stage">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          aria-label="후면 카메라 영상"
          style={{ visibility: mode === 'xr' ? 'hidden' : 'visible' }}
        />
        <div className="camera-mode">
          {mode === 'xr'
            ? hit
              ? 'WebXR 평면 인식 · 현재 세션만 유효'
              : 'WebXR · 바닥 탐색 중'
            : '카메라 오버레이 · 가상 바닥 연출'}
        </div>
        {!fired && (
          <svg className="loaded-hand" viewBox="0 0 250 230" aria-label="코딱지를 장전한 손">
            <path
              d="M62 230L53 156Q50 127 76 124L88 138L70 79Q65 60 80 57Q93 54 101 74L119 119L137 49Q141 28 158 34Q173 39 166 60L155 113Q175 94 187 110L207 149Q220 176 203 203L190 230Z"
              fill="#d7b48c"
              stroke="#8b7057"
              strokeWidth="3"
            />
            <path
              d="M92 144Q130 135 161 160M112 185Q140 168 165 183"
              fill="none"
              stroke="#b8916d"
              strokeWidth="3"
            />
            <ellipse
              cx="151"
              cy="32"
              rx={traits.size === 'large' ? 16 : traits.size === 'medium' ? 12 : 8}
              ry="9"
              fill={COLORS.find((c) => c.id === traits.color)?.hex}
            />
          </svg>
        )}
        <div className="camera-target">+</div>
      </div>
      <div className="camera-top">
        <button className="camera-close" aria-label="카메라 닫기" onClick={onClose}>
          <X size={22} />
        </button>
        <span>
          {heading === null
            ? '방향 미확인 · 가상 바닥'
            : `기기 방향 약 ${heading}° · 정밀 복원 아님`}
        </span>
      </div>
      <div className="camera-bottom">
        {directionDelta !== null && (
          <p className="direction-hint">
            GPS·나침반 참고:{' '}
            {Math.abs(directionDelta) < 30
              ? '대략 앞쪽'
              : directionDelta > 0
                ? '오른쪽 방향'
                : '왼쪽 방향'}{' '}
            · 표시 위치는 가상 바닥입니다.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <p>
          {discovery
            ? '선택한 표본을 가까운 가상 바닥에 놓아보세요.'
            : '손에서 위로 밀어 코딱지를 튕겨보세요.'}
        </p>
        <strong>GPS는 주변 위치만 나타냅니다. 같은 바닥 지점의 복원이 아닙니다.</strong>
        <div>
          <button
            className="primary"
            disabled={!ready || fired || (mode === 'xr' && !hit)}
            onClick={() => engine.current?.fire()}
          >
            <Camera size={17} />
            {fired ? '표시 완료' : discovery ? '가상 바닥에 표시' : '튕기기'}
          </button>
          {xrSupported && mode === 'overlay' && ready && !fired && (
            <button
              className="outline"
              onClick={() =>
                void engine.current
                  ?.startXR()
                  .catch((e) => setError(e instanceof Error ? e.message : '평면 인식 시작 실패'))
              }
            >
              <Crosshair size={16} />
              실제 평면 인식 시도
            </button>
          )}
          <button className="text-button" onClick={() => void requestDirection()}>
            방향 센서 허용
          </button>
        </div>
      </div>
    </div>
  )
}
