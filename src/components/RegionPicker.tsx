import { useRef, useState } from 'react'
import { Check, Crosshair, LoaderCircle, MapPin, Search, X } from 'lucide-react'
import { reverseRegion, searchRegions } from '../lib/api'
import { SEED_REGIONS } from '../lib/domain'
import type { Region } from '../lib/domain'
interface Props {
  value: Region | null
  onChange: (r: Region | null) => void
  gps?: boolean
  label?: string
}
export default function RegionPicker({
  value,
  onChange,
  gps = false,
  label = '관측 지역 검색',
}: Props) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Region[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const request = useRef(0)
  async function search() {
    const id = ++request.current
    setBusy(true)
    setError('')
    try {
      const rows = await searchRegions(query)
      if (id === request.current) setResults(rows)
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : '지역 검색에 실패했습니다.')
    } finally {
      if (id === request.current) setBusy(false)
    }
  }
  function pick(r: Region) {
    request.current++
    onChange(r)
    setResults(null)
    setError('')
    setQuery('')
    setBusy(false)
  }
  function gpsSelect() {
    if (!navigator.geolocation) {
      setError('이 브라우저에서는 위치 확인을 지원하지 않습니다. 지역을 직접 검색해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    const id = ++request.current
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const r = await reverseRegion(position.coords.latitude, position.coords.longitude)
          if (id === request.current) pick(r)
        } catch (e) {
          if (id === request.current)
            setError(e instanceof Error ? e.message : '위치에서 지역을 찾지 못했습니다.')
        } finally {
          if (id === request.current) setBusy(false)
        }
      },
      (e) => {
        if (id !== request.current) return
        setBusy(false)
        setError(
          e.code === 1
            ? '위치 권한이 거부되었습니다. 아래에서 지역을 직접 검색할 수 있습니다.'
            : '위치를 확인하지 못했습니다. 지역을 직접 검색해 주세요.',
        )
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }
  return (
    <div className="region-picker">
      <label className="field-label">{label}</label>
      <div className="search-box">
        <Search size={18} />
        <input
          aria-label={label}
          value={query}
          placeholder="시·군·구 또는 해외 도시 검색"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <button
          type="button"
          className="search-submit"
          onClick={() => void search()}
          disabled={busy || query.trim().length < 2}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : '검색'}
        </button>
        {gps && (
          <button
            title="현재 위치로 행정구역 찾기"
            aria-label="GPS로 지역 찾기"
            type="button"
            className="gps-button"
            onClick={gpsSelect}
            disabled={busy}
          >
            <Crosshair size={19} />
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {results && (
        <div className="search-results" aria-live="polite">
          <div className="results-heading">
            행정구역 검색 결과
            <button type="button" aria-label="검색 결과 닫기" onClick={() => setResults(null)}>
              <X size={15} />
            </button>
          </div>
          {results.length ? (
            results.map((r) => (
              <button type="button" key={r.id} onClick={() => pick(r)}>
                <MapPin size={16} />
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.country} · {r.admin1 || '행정구역'}
                  </small>
                  <small>{r.source}</small>
                </span>
                <Check size={16} />
              </button>
            ))
          ) : (
            <p>
              선택 가능한 시·군·구급 행정구역이 없습니다. 국가명과 지역명을 함께 검색해 주세요.
              제공되지 않는 지역은 등록할 수 없습니다.
            </p>
          )}
        </div>
      )}
      {value && (
        <div className="selected-region">
          <MapPin size={16} />
          <span>
            <strong>{value.name}</strong>
            <small>
              {value.country} · {value.admin1}
            </small>
          </span>
          <button type="button" aria-label="선택 지역 해제" onClick={() => onChange(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {!value && (
        <div className="quick-regions">
          <span>빠른 선택</span>
          {SEED_REGIONS.slice(0, 3).map((r) => (
            <button type="button" key={r.id} onClick={() => pick(r)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      {gps && (
        <p className="field-hint">
          GPS는 버튼을 눌러야 사용됩니다. 조회 후 행정구역만 선택되며, 정확한 좌표와 상세 주소는
          저장하지 않습니다. 선택한 지역은 언제든 수정할 수 있습니다.
        </p>
      )}
    </div>
  )
}
