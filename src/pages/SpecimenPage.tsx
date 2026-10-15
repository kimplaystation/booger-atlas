import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowRight, Camera, Link } from 'lucide-react'
import { fieldURL, getField, lifeAge } from '../lib/fieldApi'
import type { PublicSpecimen } from '../lib/fieldApi'
import { COLORS, SIZES } from '../lib/domain'
import { DEMO } from '../lib/api'
import Specimen from '../components/Specimen'
const CameraStage = lazy(() => import('../ar/CameraStage'))
const FieldAtlas = lazy(() => import('../components/FieldAtlas'))
export default function SpecimenPage({ id }: { id: string }) {
  const [specimen, setSpecimen] = useState<PublicSpecimen | null>(null),
    [error, setError] = useState(''),
    [link, setLink] = useState(''),
    [camera, setCamera] = useState(false)
  useEffect(() => {
    let active = true
    setSpecimen(null)
    setError('')
    void getField(id)
      .then((s) => {
        if (active) setSpecimen(s)
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '표본을 불러오지 못했습니다.')
      })
    return () => {
      active = false
    }
  }, [id])
  async function share() {
    const url = fieldURL(id)
    setLink(url)
    try {
      if (navigator.share) await navigator.share({ title: 'BOOGER ATLAS · 이 코딱지의 생애', url })
      else await navigator.clipboard.writeText(url)
    } catch {
      /* The selectable URL remains available. */
    }
  }
  if (error)
    return (
      <section className="panel field-detail">
        <h1>표본을 확인할 수 없습니다.</h1>
        <p role="alert">{error}</p>
        <a href="#field" className="primary">
          코딱지 튕기기
        </a>
      </section>
    )
  if (!specimen) return <p role="status">표본을 불러오고 있습니다…</p>
  const s = specimen
  return (
    <section className="field-detail">
      <p className="eyebrow">GPS SPECIMEN · 생애 기록</p>
      <h1>
        {s.status === 'alive' ? '아직 살아 있는 작은 발견.' : '사라졌지만, 기록은 남았습니다.'}
      </h1>
      <div className="panel specimen-summary">
        <Specimen color={COLORS.find((c) => c.id === s.color)?.hex} />
        <div>
          <span className={`life-status ${s.status}`}>
            {s.status === 'alive' ? '생존' : '소멸'} · {lifeAge(s)}
          </span>
          <h2>
            {COLORS.find((c) => c.id === s.color)?.label} ·{' '}
            {SIZES.find((z) => z.id === s.size)?.label}
          </h2>
          <p>
            건조도 {s.dryness}/5 · 최초 {s.initialDryness}/5
          </p>
          <p>
            {s.region.country} · {s.region.admin1} · {s.region.name}
          </p>
          <p>{s.indoor ? '실내 · 외부 기상 효과 제외' : '실외 · 가상 기상 규칙 적용 대상'}</p>
          <p className="muted">
            등록 {new Date(s.createdAt).toLocaleString('ko-KR')}
            <br />
            최근 기상 갱신{' '}
            {s.events?.some((e) => !!e.weather)
              ? new Date(s.lastTick).toLocaleString('ko-KR')
              : '아직 없음'}
          </p>
          <p className="field-hint">
            {DEMO
              ? '이 브라우저의 데모 기록입니다. 서버 갱신·다른 기기 공유는 실행되지 않습니다.'
              : '서버 스케줄러가 설정되어야 브라우저를 닫아도 상태가 갱신됩니다. 기상자료가 없으면 마지막 상태를 유지합니다.'}
          </p>
          <button className="primary" onClick={() => void share()}>
            <Link size={17} />
            {DEMO ? '이 브라우저용 링크 복사' : '이 코딱지 공유하기'}
          </button>
          {s.status === 'alive' && (
            <button className="outline" onClick={() => setCamera(true)}>
              <Camera size={17} />
              가상 바닥에 미리보기
            </button>
          )}
          {link && (
            <label className="share-link">
              {DEMO
                ? '다른 기기에서는 열 수 없는 로컬 데모 링크'
                : '공유 링크 · 아래에서 복사 가능'}
              <input
                aria-label="코딱지 공유 링크"
                value={link}
                readOnly
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          <p className="field-hint">
            미리보기는 방문 인증이나 같은 바닥의 복원이 아닙니다. 근처 발견은 GPS로 확인하세요.
          </p>
        </div>
      </div>
      <Suspense fallback={<p>지도 준비 중…</p>}>
        <FieldAtlas selected={s} />
      </Suspense>
      <section className="panel life-history">
        <h2>생애 기록</h2>
        <p className="notice">
          날씨는 Open-Meteo 기상 모델·재분석 자료입니다. 건조도·이동·소멸은 과학적 예측이 아닌 가상
          게임 규칙 v1의 결과입니다.
        </p>
        <ol>
          {s.events?.map((e) => (
            <li key={e.at}>
              <time>{new Date(e.at).toLocaleString('ko-KR')}</time>
              <strong>
                {e.type === 'created'
                  ? '탄생'
                  : e.type === 'moved'
                    ? '가상 이동'
                    : e.type === 'dissolved'
                      ? '소멸'
                      : '기상 변화'}
              </strong>
              <p>{e.description}</p>
              {e.weather && (
                <small>
                  {e.weather.source} · {e.weather.temperature}°C · 습도 {e.weather.humidity}% · 강수{' '}
                  {e.weather.precipitation}mm · 풍속 {e.weather.windSpeed}m/s · 풍향{' '}
                  {e.weather.windDirection}° (불어오는 방향)
                </small>
              )}
            </li>
          ))}
        </ol>
        <p className="field-hint">
          최근 500개 사건을 표시합니다. 소멸 후에도 서버의 전체 이력은 삭제하지 않습니다.
        </p>
      </section>
      <a href="#field" className="primary">
        나도 코딱지 튕기기
        <ArrowRight size={18} />
      </a>
      {camera && (
        <Suspense fallback={<p>카메라 준비 중…</p>}>
          <CameraStage
            traits={{ color: s.color, size: s.size, dryness: s.dryness }}
            discovery
            onClose={() => setCamera(false)}
            onLanded={() => {}}
          />
        </Suspense>
      )}
    </section>
  )
}
