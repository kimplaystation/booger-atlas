import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Database,
  FlaskConical,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import RegionPicker from '../components/RegionPicker'
import { DEMO, saveObservation } from '../lib/api'
import { COLORS, SIZES, localDate } from '../lib/domain'
import type { Color, Region, Size } from '../lib/domain'
export default function RecordPage({
  selected,
  onSelect,
  onComplete,
  onMap,
  onAnalysis,
}: {
  selected: Region | null
  onSelect: (r: Region | null) => void
  onComplete: () => Promise<void>
  onMap: () => void
  onAnalysis: () => void
}) {
  const [date, setDate] = useState(localDate()),
    [color, setColor] = useState<Color | ''>(''),
    [size, setSize] = useState<Size | ''>(''),
    [dryness, setDryness] = useState(3),
    [trap, setTrap] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false)
  const started = useRef(Date.now()),
    submission = useRef(crypto.randomUUID()),
    inFlight = useRef(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    if (!selected) {
      setError('발견 지역을 반드시 선택해 주세요.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await saveObservation(
        {
          id: submission.current,
          regionId: selected.id,
          date,
          color: color as Color,
          size: size as Size,
          dryness,
        },
        selected,
        trap,
        started.current,
      )
      setDone(true)
      await onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 중 문제가 발생했습니다.')
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  if (done)
    return (
      <section className="success-panel panel">
        <span className="success-icon">
          <Check size={34} />
        </span>
        <p className="eyebrow">OBSERVATION RECEIVED</p>
        <h1>소중한 표본이 접수되었습니다.</h1>
        <p>
          {selected?.admin1} {selected?.name} · {date}
          <br />
          {DEMO
            ? '이 브라우저의 데모 저장소에만 기록했습니다.'
            : '공동 관측 데이터베이스에 기록했습니다.'}
        </p>
        <div className="notice">
          {DEMO
            ? '데모 기록은 다른 사람에게 보이지 않으며, 브라우저 데이터를 지우면 사라집니다.'
            : '개인 좌표 없이 행정구역별 통계에 반영됩니다.'}
        </div>
        <div className="success-actions">
          <button className="primary" onClick={onAnalysis}>
            이 지역 분석 보기
            <ArrowRight size={16} />
          </button>
          <button className="outline" onClick={onMap}>
            관측 지도로 돌아가기
          </button>
        </div>
      </section>
    )
  return (
    <>
      <button className="back-button" onClick={onMap}>
        <ArrowLeft size={15} />
        관측 지도로
      </button>
      <div className="page-title">
        <p className="eyebrow">SPECIMEN REGISTRATION</p>
        <h1>작은 발견을 기록해 주세요.</h1>
        <p>로그인 없이, 약 10초. 당신의 관측이 지도의 한 점이 됩니다.</p>
      </div>
      <div className="record-layout">
        <form className="panel record-form" onSubmit={submit} noValidate>
          <div className="form-heading">
            <h2>코딱지 관측 기록서</h2>
            <span className="tag">FORM BA–01</span>
          </div>
          <div className="form-section">
            <span className="step-number">01</span>
            <div>
              <RegionPicker value={selected} onChange={onSelect} gps label="발견 지역 · 필수" />
            </div>
          </div>
          <div className="form-section">
            <span className="step-number">02</span>
            <div>
              <label htmlFor="found-date" className="field-label">
                발견 날짜 · 필수
              </label>
              <input
                id="found-date"
                className="date-input"
                type="date"
                min="1940-01-01"
                max={localDate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="form-section">
            <span className="step-number">03</span>
            <fieldset>
              <legend className="field-label">색상 · 필수</legend>
              <div className="color-options">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={color === c.id}
                    className={color === c.id ? 'selected' : ''}
                    onClick={() => setColor(c.id)}
                  >
                    <i style={{ background: c.hex }}>{color === c.id && <Check size={16} />}</i>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="form-section">
            <span className="step-number">04</span>
            <fieldset>
              <legend className="field-label">크기 · 필수</legend>
              <div className="size-options">
                {SIZES.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={size === s.id}
                    className={size === s.id ? 'selected' : ''}
                    onClick={() => setSize(s.id)}
                  >
                    <span style={{ width: 8 + i * 5, height: 8 + i * 5 }} />
                    <strong>{s.label}</strong>
                    <small>{s.hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="form-section">
            <span className="step-number">05</span>
            <fieldset>
              <legend className="field-label">
                건조도 · 필수 <span className="muted">현재 {dryness}단계</span>
              </legend>
              <div className="dry-options">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`건조도 ${n}단계`}
                    aria-pressed={dryness === n}
                    className={dryness === n ? 'selected' : ''}
                    onClick={() => setDryness(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="dry-labels">
                <span>촉촉함</span>
                <span>보통</span>
                <span>매우 건조함</span>
              </div>
            </fieldset>
          </div>
          <div className="honeypot" aria-hidden="true">
            <label>
              웹사이트
              <input
                name="website"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="submit-row">
            <p>
              <ShieldCheck size={14} />
              익명 등록 · 상세 위치 저장 없음
            </p>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}{' '}
              {busy ? '등록 중…' : '표본 등록하기'}
            </button>
          </div>
        </form>
        <aside className="record-guide">
          <FlaskConical size={32} strokeWidth={1.2} />
          <h2>
            모든 표본에는
            <br />
            이야기가 있습니다.
          </h2>
          <p>
            특별한 표본이 아니어도 괜찮습니다.
            <br />
            일상 속 작은 발견을 있는 그대로
            <br />
            기록해 주세요.
          </p>
          <hr />
          <h3>
            <CircleHelp size={16} />
            조사원 안내
          </h3>
          <ul>
            <li>대한민국은 시·군·구까지, 해외는 제공되는 동급 행정구역을 선택합니다.</li>
            <li>색상과 크기는 눈으로 관찰한 대략적인 특징입니다.</li>
            <li>관측 시점의 지역과 날짜를 기록해 주세요.</li>
            <li>표본을 억지로 채취할 필요는 없습니다.</li>
          </ul>
          <div className="notice">
            <Database size={17} />
            <span>
              {DEMO
                ? '현재 데모 모드입니다. 이 기기에서만 기록이 유지됩니다.'
                : '공동 수집 모드입니다. 등록 내용은 지역 통계로 공개됩니다.'}
            </span>
          </div>
        </aside>
      </div>
    </>
  )
}
