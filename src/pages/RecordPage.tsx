import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react'
import RegionPicker from '../components/RegionPicker'
import CertificateView from '../components/CertificateView'
import GlobeScan from '../components/GlobeScan'
import { DEMO, saveObservation } from '../lib/api'
import { COLORS, SIZES, isDate, localDate } from '../lib/domain'
import {
  DRY_LABELS,
  lastCertificate,
  LAST_CERTIFICATE,
  makeCertificate,
  rememberCertificate,
} from '../lib/certificate'
import type { Certificate } from '../lib/certificate'
import type { Color, Observation, Region, Size } from '../lib/domain'

export default function RecordPage({
  selected,
  onSelect,
  onComplete,
  onMap,
  onAnalysis,
  onHome,
}: {
  selected: Region | null
  onSelect: (r: Region | null) => void
  onComplete: () => Promise<void>
  onMap: () => void
  onAnalysis: () => void
  onHome: () => void
}) {
  const [step, setStep] = useState(1),
    [date, setDate] = useState(localDate()),
    [color, setColor] = useState<Color | ''>(''),
    [size, setSize] = useState<Size | ''>(''),
    [dryness, setDryness] = useState(3),
    [trap, setTrap] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState<Certificate | null>(lastCertificate)
  const started = useRef(Date.now()),
    inFlight = useRef(false)
  // Freeze an uncertain submission for a safe retry using the same UUID and payload.
  const pending = useRef<{ observation: Observation; region: Region } | null>(null)
  function next() {
    setError('')
    if (step === 1) {
      if (!selected) {
        setError('발견 지역을 반드시 선택해 주세요.')
        return
      }
      if (!isDate(date) || date < '1940-01-01' || date > localDate()) {
        setError('발견 날짜는 1940년부터 오늘까지의 유효한 날짜를 선택해 주세요.')
        return
      }
    }
    if (step === 2 && (!color || !size)) {
      setError(!color ? '색상을 선택해 주세요.' : '크기를 선택해 주세요.')
      return
    }
    setStep(step + 1)
  }
  function restart() {
    try {
      sessionStorage.removeItem(LAST_CERTIFICATE)
    } catch {
      /* Optional history */
    }
    setDone(null)
    setStep(1)
    setError('')
    setColor('')
    setSize('')
    setDryness(3)
    setDate(localDate())
    pending.current = null
    started.current = Date.now()
    window.scrollTo({ top: 0 })
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (step < 3) {
      next()
      return
    }
    if (inFlight.current || !selected || !color || !size) return
    inFlight.current = true
    setBusy(true)
    setError('')
    if (!pending.current)
      pending.current = {
        observation: { id: crypto.randomUUID(), regionId: selected.id, date, color, size, dryness },
        region: selected,
      }
    const payload = pending.current
    try {
      await Promise.all([
        saveObservation(payload.observation, payload.region, trap, started.current),
        new Promise((resolve) =>
          setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 2300),
        ),
      ])
      const certificate = makeCertificate(payload.observation, payload.region, DEMO)
      rememberCertificate(certificate)
      setDone(certificate)
      void onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 중 문제가 발생했습니다.')
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  if (done)
    return (
      <CertificateView
        certificate={done}
        onStart={restart}
        onMap={onMap}
        onAnalysis={selected?.id === done.region.id ? onAnalysis : undefined}
      />
    )
  if (busy && pending.current) return <GlobeScan region={pending.current.region} />
  return (
    <section className="exam-page">
      <button className="back-button" onClick={onHome}>
        <ArrowLeft size={15} />
        처음으로
      </button>
      <div className="exam-heading">
        <p className="eyebrow">국제 코딱지 감정소 · 간이 검사</p>
        <ol className="exam-progress" aria-label="검사 진행 단계">
          {['발견 장소', '생김새', '촉감'].map((label, i) => (
            <li
              key={label}
              className={step >= i + 1 ? 'current' : ''}
              aria-current={step === i + 1 ? 'step' : undefined}
            >
              <span>{step > i + 1 ? <Check size={14} /> : `0${i + 1}`}</span>
              {label}
            </li>
          ))}
        </ol>
        <h1>{['어디서 발견하셨나요?', '어떤 모습인가요?', '얼마나 바삭한가요?'][step - 1]}</h1>
        <p>
          {
            [
              '국제 표본이 되려면 출신지는 알아야죠.',
              '사진은 필요 없어요. 눈으로 보고 골라주세요.',
              '마지막 질문입니다. 감정서용 종이를 꺼내둘게요.',
            ][step - 1]
          }
        </p>
      </div>
      <form className="panel exam-form" onSubmit={submit} noValidate>
        <fieldset className="exam-fields" disabled={!!pending.current}>
          {step === 1 && (
            <>
              <RegionPicker value={selected} onChange={onSelect} gps label="발견 지역 · 필수" />
              <p className="exam-hint">
                GPS는 선택사항이에요. 직접 검색해도 되고, 선택한 지역은 수정할 수 있어요.
              </p>
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
              <p className="exam-hint">오늘 발견했다면 그대로 두세요.</p>
            </>
          )}
          {step === 2 && (
            <>
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
              <p className="exam-hint">자의 정밀함은 필요 없어요. 대략적인 관찰이면 충분합니다.</p>
            </>
          )}
          {step === 3 && (
            <>
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
                <p className="dry-description">
                  {DRY_LABELS[dryness - 1]}
                  <small>
                    {
                      [
                        '아직 수분과 친한 사이군요.',
                        '적당히 말랑한 상태군요.',
                        '촉촉함과 바삭함의 중간이군요.',
                        '바삭한 기운이 느껴지는군요.',
                        '수분과 작별한 상태군요.',
                      ][dryness - 1]
                    }
                  </small>
                </p>
              </fieldset>
              <div className="exam-review">
                <span>접수 내용 확인</span>
                <strong>
                  {selected?.country} · {selected?.admin1} · {selected?.name}
                </strong>
                <p>
                  {date} · {COLORS.find((c) => c.id === color)?.label} ·{' '}
                  {SIZES.find((s) => s.id === size)?.label} · 건조도 {dryness}/5
                </p>
              </div>
              <p className="exam-hint">
                {DEMO
                  ? '데모: 이 브라우저에만 저장됩니다. 감정서는 이미지·링크로 공유할 수 있어요.'
                  : '접수하면 익명 표본이 저장되고 행정구역별 통계에 반영됩니다.'}
              </p>
            </>
          )}
        </fieldset>
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
          <div className="field-error" role="alert">
            {error}
            {pending.current && (
              <p>
                저장 결과를 확인하지 못했습니다. 중복 등록을 막기 위해 같은 내용으로 다시
                확인합니다.
              </p>
            )}
          </div>
        )}
        <div className="exam-controls">
          {step > 1 && !pending.current && (
            <button
              type="button"
              className="outline"
              onClick={() => {
                setStep(step - 1)
                setError('')
              }}
            >
              <ArrowLeft size={16} />
              이전
            </button>
          )}
          <button className="primary" type="submit">
            {step === 3
              ? pending.current
                ? '같은 표본 다시 확인'
                : '표본 등록하고 감정서 받기'
              : '다음'}
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="exam-privacy">
          <ShieldCheck size={14} />
          익명 등록 · 상세 위치 저장 없음 · 억지로 채취하지 마세요
        </p>
      </form>
    </section>
  )
}
