import { lazy, Suspense, useRef, useState } from 'react'
import { ArrowRight, Camera, Crosshair, MapPin } from 'lucide-react'
import { COLORS, SIZES } from '../lib/domain'
import type { Region } from '../lib/domain'
import { DEMO, reverseRegion } from '../lib/api'
import { nearbyField, saveField, lifeAge } from '../lib/fieldApi'
import type { Position, PublicSpecimen, Traits } from '../lib/fieldApi'
import RegionPicker from '../components/RegionPicker'
const CameraStage = lazy(() => import('../ar/CameraStage'))
export default function FieldPage({
  onRecord,
  onDetail,
}: {
  onRecord: () => void
  onDetail: (id: string) => void
}) {
  const [traits, setTraits] = useState<Traits>({ color: 'yellow', size: 'medium', dryness: 3 }),
    [region, setRegion] = useState<Region | null>(null),
    [fix, setFix] = useState<{ position: Position; accuracy: number; time: number } | null>(null),
    [gpsBusy, setGpsBusy] = useState(false),
    [error, setError] = useState(''),
    [manual, setManual] = useState(false),
    [camera, setCamera] = useState(false),
    [landed, setLanded] = useState(false),
    [saving, setSaving] = useState(false),
    [indoor, setIndoor] = useState(false),
    [publicLocation, setPublicLocation] = useState(false),
    [consent, setConsent] = useState(false),
    [tab, setTab] = useState<'throw' | 'nearby'>('throw'),
    [nearby, setNearby] = useState<PublicSpecimen[] | null>(null),
    [radius, setRadius] = useState(30),
    [viewing, setViewing] = useState<PublicSpecimen | null>(null)
  const started = useRef(Date.now()),
    inFlight = useRef(false),
    pending = useRef<Parameters<typeof saveField>[0] | null>(null)
  async function locate() {
    if (!navigator.geolocation) {
      setError('GPS를 지원하지 않습니다. 지역별 표본 기록을 이용해 주세요.')
      setManual(true)
      return
    }
    setGpsBusy(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const current = {
          position: { latitude: p.coords.latitude, longitude: p.coords.longitude },
          accuracy: p.coords.accuracy,
          time: Date.now(),
        }
        setFix(current)
        setRegion(null)
        try {
          const r = await reverseRegion(current.position.latitude, current.position.longitude)
          setRegion(r)
          setManual(false)
        } catch (e) {
          setError(e instanceof Error ? e.message : '행정구역 확인 실패')
          setManual(true)
        } finally {
          setGpsBusy(false)
        }
      },
      (e) => {
        setGpsBusy(false)
        setFix(null)
        setManual(true)
        setError(
          e.code === 1
            ? 'GPS 권한이 거부되었습니다. GPS 배치는 제한되지만 지역별 표본 기록은 가능합니다.'
            : 'GPS 위치를 확인하지 못했습니다. 창가나 야외에서 다시 시도해 주세요.',
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )
  }
  async function findNearby() {
    if (!fix || Date.now() - fix.time > 120000) {
      setError('먼저 GPS로 현재 위치를 새로 확인해 주세요.')
      return
    }
    if (fix.accuracy > 100) {
      setError('GPS 오차가 100m를 넘습니다. 가까운 표본을 구분하기 어려워 검색을 제한합니다.')
      return
    }
    setGpsBusy(true)
    setError('')
    try {
      const result = await nearbyField(fix.position)
      setNearby(result.specimens)
      setRadius(result.radius)
    } catch (e) {
      setError(e instanceof Error ? e.message : '근처 표본 조회 실패')
      setNearby(null)
    } finally {
      setGpsBusy(false)
    }
  }
  async function save() {
    if (inFlight.current) return
    if (!pending.current) {
      if (!landed || !fix || !region || !consent) {
        setError('튕기기와 GPS 확인, 위치 저장 동의를 완료해 주세요.')
        return
      }
      if (Date.now() - fix.time > 60000) {
        setError('GPS 확인 후 1분이 지났습니다. GPS를 다시 확인한 뒤 저장해 주세요.')
        return
      }
      if (fix.accuracy > 100) {
        setError('GPS 오차가 100m를 넘습니다. 더 정확한 위치를 확인한 뒤 저장해 주세요.')
        return
      }
      pending.current = {
        id: crypto.randomUUID(),
        traits,
        region,
        position: fix.position,
        accuracy: fix.accuracy,
        indoor,
        publicLocation,
        startedAt: started.current,
      }
    }
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const s = await saveField(pending.current)
      onDetail(s.id)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '저장에 실패했습니다. 같은 표본으로 다시 시도할 수 있습니다.',
      )
    } finally {
      setSaving(false)
      inFlight.current = false
    }
  }
  return (
    <section className="field-page">
      <div className="field-title">
        <p className="eyebrow">BOOGER ATLAS · GPS FIELD PLAY</p>
        <h1>
          작은 한 발,
          <br />
          거대한 코딱지 발자취.
        </h1>
        <p>카메라로 튕기고, 같은 지역에서 친구의 표본을 발견하세요.</p>
        <div className="field-tabs">
          <button className={tab === 'throw' ? 'selected' : ''} onClick={() => setTab('throw')}>
            코딱지 튕기기
          </button>
          <button className={tab === 'nearby' ? 'selected' : ''} onClick={() => setTab('nearby')}>
            근처 발견
          </button>
        </div>
      </div>
      <div className="field-layout">
        <div className="panel field-controls">
          <div className="gps-status">
            <h2>
              <MapPin size={19} />
              발견 지역 자동 확인
            </h2>
            <button
              className="primary"
              disabled={gpsBusy || !!pending.current}
              onClick={() => void locate()}
            >
              <Crosshair size={17} />
              {gpsBusy ? '위치 확인 중…' : fix ? 'GPS 새로 확인' : 'GPS로 현재 지역 확인'}
            </button>
            {region && (
              <div className="selected-region">
                <MapPin size={16} />
                <span>
                  <strong>{region.name}</strong>
                  <small>
                    {region.country} · {region.admin1}
                  </small>
                </span>
                <button
                  className="text-button"
                  disabled={!!pending.current}
                  onClick={() => setManual(true)}
                >
                  지역 수정
                </button>
              </div>
            )}
            {fix && (
              <p className={fix.accuracy > 30 ? 'gps-warning' : 'muted'}>
                GPS 예상 오차 약 {Math.ceil(fix.accuracy)}m{' '}
                {fix.accuracy > 30 &&
                  '· 기본 발견 반경보다 오차가 큽니다. 위치와 거리는 부정확할 수 있어요.'}
              </p>
            )}
            {manual && (
              <RegionPicker value={region} onChange={setRegion} label="발견 지역 직접 수정" />
            )}
            <p className="field-hint">
              위치는 버튼을 눌러야 요청합니다. GPS를 허용하면 행정구역을 자동 선택합니다.
            </p>
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {tab === 'throw' ? (
            <>
              <fieldset className="field-traits" disabled={saving || !!pending.current}>
                <legend>장전할 코딱지</legend>
                <label>
                  색상
                  <select
                    aria-label="코딱지 색상"
                    value={traits.color}
                    onChange={(e) => {
                      setTraits({ ...traits, color: e.target.value as Traits['color'] })
                      setLanded(false)
                    }}
                  >
                    {COLORS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  크기
                  <select
                    aria-label="코딱지 크기"
                    value={traits.size}
                    onChange={(e) => {
                      setTraits({ ...traits, size: e.target.value as Traits['size'] })
                      setLanded(false)
                    }}
                  >
                    {SIZES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-dryness">
                  건조도 {traits.dryness}/5
                  <input
                    aria-label="코딱지 건조도"
                    type="range"
                    min="1"
                    max="5"
                    value={traits.dryness}
                    onChange={(e) => {
                      setTraits({ ...traits, dryness: Number(e.target.value) })
                      setLanded(false)
                    }}
                  />
                  <span>촉촉함 ↔ 바삭함</span>
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={indoor}
                    onChange={(e) => setIndoor(e.target.checked)}
                  />
                  실내 표본 (외부 날씨 효과 제외)
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={publicLocation}
                    onChange={(e) => setPublicLocation(e.target.checked)}
                  />
                  세계지도에 약 500m 단위의 위치·이동 경로 공개
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  GPS 주변 위치를 약 20m 단위로 저장하고, 가까운 방문자에게 표본과 대략적 거리를
                  보여주는 데 동의합니다.
                </label>
              </fieldset>
              <div className="field-primary-actions">
                <button
                  className="primary"
                  disabled={saving || !!pending.current}
                  onClick={() => {
                    setViewing(null)
                    setCamera(true)
                  }}
                >
                  <Camera size={19} />
                  {landed ? '다시 튕기기' : '카메라 켜고 튕기기'}
                </button>
                <button
                  className="outline"
                  disabled={saving || !landed || !fix || !region || !consent || fix.accuracy > 100}
                  onClick={() => void save()}
                >
                  {saving
                    ? '저장 확인 중…'
                    : pending.current
                      ? '같은 표본 저장 재시도'
                      : 'GPS 주변에 저장'}
                  <ArrowRight size={17} />
                </button>
              </div>
              {landed && (
                <p className="landing-status" role="status">
                  튕기기 완료! 아직 저장되지 않았습니다. GPS 주변에 저장 버튼을 눌러주세요.
                </p>
              )}
              {pending.current && error && (
                <p className="field-hint">
                  중복 저장을 막기 위해 동일한 표본 번호와 내용으로 재시도합니다.
                </p>
              )}
            </>
          ) : (
            <div className="nearby-results">
              <h2>약 {radius}m 안의 살아 있는 표본</h2>
              <p className="field-hint">
                GPS 오차와 저장 위치 반올림 때문에 실제 거리와 차이가 날 수 있습니다.
              </p>
              <button
                className="primary"
                disabled={gpsBusy || !fix}
                onClick={() => void findNearby()}
              >
                근처 코딱지 찾기
              </button>
              {nearby?.length === 0 && <p role="status">이 범위에서 발견한 표본이 없습니다.</p>}
              {nearby?.map((s) => (
                <article key={s.id}>
                  <span
                    className="field-color"
                    style={{ background: COLORS.find((c) => c.id === s.color)?.hex }}
                  />
                  <div>
                    <strong>
                      {COLORS.find((c) => c.id === s.color)?.label} ·{' '}
                      {SIZES.find((z) => z.id === s.size)?.label}
                    </strong>
                    <p>
                      약 {s.distanceMeters}m · 건조도 {s.dryness}/5 · 생존 {lifeAge(s)}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setViewing(s)
                        setCamera(true)
                      }}
                    >
                      카메라에서 보기
                    </button>
                    <button className="text-button" onClick={() => onDetail(s.id)}>
                      생애 기록
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <aside className="field-guide">
          <h2>
            정확한 바닥 지점보다,
            <br />
            같은 동네에서 만나는 재미.
          </h2>
          <p>
            카메라 오버레이에서는 가까운 가상 바닥에 표시합니다. WebXR을 지원하면 현재 세션에서 평면
            인식을 시도할 수 있습니다.
          </p>
          <p>
            카메라의 착탄점과 GPS는 별개입니다. 다시 방문해도 똑같은 바닥 지점에 복원되지 않습니다.
          </p>
          <div className="notice">
            {DEMO
              ? '로컬 데모: 이 브라우저에서만 저장·발견됩니다. 다른 사용자와 공유하려면 Supabase 연결이 필요합니다. 데모에서는 서버 날씨 변화가 실행되지 않습니다.'
              : '공동 모드: 등록 후 가까운 방문자가 발견할 수 있습니다. 공개 지도 위치는 기본적으로 숨깁니다.'}
          </div>
          <p>
            위치 반올림만으로 장소가 완전히 익명화되지는 않습니다. 집 등 민감한 곳의 표본은 등록하지
            않는 편이 좋습니다.
          </p>
          <button className="text-button" onClick={onRecord}>
            GPS 없이 지역별 표본 기록하기
            <ArrowRight size={15} />
          </button>
          <a className="text-button" href="#map">
            세계 관측 지도 보기
            <ArrowRight size={15} />
          </a>
        </aside>
      </div>
      {camera && (
        <Suspense fallback={<p role="status">카메라를 준비하고 있습니다…</p>}>
          <CameraStage
            traits={
              viewing
                ? { color: viewing.color, size: viewing.size, dryness: viewing.dryness }
                : traits
            }
            discovery={!!viewing}
            approxBearing={viewing?.bearingDegrees}
            onClose={() => setCamera(false)}
            onLanded={() => {
              if (!viewing) setLanded(true)
              setTimeout(() => setCamera(false), 900)
            }}
          />
        </Suspense>
      )}
    </section>
  )
}
