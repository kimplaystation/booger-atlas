import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  ChevronRight,
  FlaskConical,
  Globe2,
  Info,
  Layers,
  MapPin,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import WorldMap, { countryName } from './components/WorldMap'
import RegionPicker from './components/RegionPicker'
import { DateFilters, Distribution } from './components/DataViews'
import RecordPage from './pages/RecordPage'
import HomePage from './pages/HomePage'
import CertificateView from './components/CertificateView'
import { decodeCertificate, LAST_CERTIFICATE } from './lib/certificate'
import AnalysisPage from './pages/AnalysisPage'
import { CONFIG_ERROR, DEMO, loadDataset, resetDemo } from './lib/api'
import {
  filterCells,
  localDate,
  SEED_REGIONS,
  shiftDate,
  summarize,
  validateFilters,
} from './lib/domain'
import type { Dataset, Filters, Region } from './lib/domain'
const FieldPage = lazy(() => import('./pages/FieldPage'))
const SpecimenPage = lazy(() => import('./pages/SpecimenPage'))
const FieldAtlas = lazy(() => import('./components/FieldAtlas'))
type Page = 'home' | 'map' | 'record' | 'analysis' | 'certificate' | 'field' | 'specimen'
function pageFromHash(): Page {
  const p = location.hash.slice(1)
  if (p.startsWith('specimen=')) return 'specimen'
  if (p === 'field') return 'field'
  return p.startsWith('certificate=')
    ? 'certificate'
    : p === 'record' || p === 'analysis' || p === 'map'
      ? p
      : 'home'
}
function App() {
  const [page, setPage] = useState<Page>(pageFromHash),
    [certificateToken, setCertificateToken] = useState(() =>
      location.hash.slice('#certificate='.length),
    ),
    [specimenId, setSpecimenId] = useState(() => location.hash.slice('#specimen='.length)),
    [examKey, setExamKey] = useState(0),
    [selected, setSelected] = useState<Region | null>(null),
    [country, setCountry] = useState<string | null>(null)
  const [data, setData] = useState<Dataset>({ regions: SEED_REGIONS, cells: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const today = localDate()
  const [filters, setFilters] = useState<Filters>({ from: shiftDate(today, -29), to: today })
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loadDataset())
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (page === 'map' || page === 'analysis') void reload()
  }, [reload, page])
  useEffect(() => {
    const handler = () => {
      setPage(pageFromHash())
      setCertificateToken(location.hash.slice('#certificate='.length))
      setSpecimenId(location.hash.slice('#specimen='.length))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  function startExam() {
    try {
      sessionStorage.removeItem(LAST_CERTIFICATE)
    } catch {
      /* Optional history */
    }
    setExamKey((k) => k + 1)
    navigate('record')
  }
  const sharedCertificate = page === 'certificate' ? decodeCertificate(certificateToken) : null
  function navigate(p: Page) {
    location.hash = p
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function select(r: Region | null) {
    setSelected(r)
    setCountry(null)
  }
  const ready = !loading && !error && !validateFilters(filters)
  const mapStatus = loading
    ? '관측자료를 불러오는 중입니다.'
    : error
      ? '관측자료를 확인할 수 없습니다. 연결 상태를 확인해 주세요.'
      : validateFilters(filters) || ''
  const filtered = validateFilters(filters) ? [] : filterCells(data.cells, filters)
  const summary = summarize(filtered),
    regionCells = selected
      ? filtered.filter((c) => c.regionId === selected.id)
      : filtered.filter((c) =>
          country ? data.regions.find((r) => r.id === c.regionId)?.countryCode === country : false,
        ),
    local = summarize(regionCells)
  const activeRegions = data.regions.filter((r) => filtered.some((c) => c.regionId === r.id))
  const activeCountries = new Set(activeRegions.map((r) => r.countryCode)).size
  return (
    <>
      <div className={`mode-strip ${DEMO ? '' : 'connected'}`}>
        <div>
          <span className="mode-dot" />
          {DEMO ? '데모 관측소' : '공동 관측소'}
          <span className="mode-divider">/</span>
          {DEMO
            ? '이 브라우저에만 저장됩니다. 전 세계에 공유되는 실제 데이터가 아닙니다.'
            : '등록한 표본은 행정구역 단위로 공동 집계됩니다.'}
        </div>
        <span className="edition">CITIZEN SCIENCE PROJECT · VOL. 01</span>
      </div>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="BOOGER ATLAS 홈">
          <span className="brand-symbol">
            <Globe2 size={31} strokeWidth={1.3} />
            <i />
          </span>
          <span>
            <strong>
              BOOGER ATLAS<span className="brand-dot">®</span>
            </strong>
            <small>세계 코딱지 지질조사국</small>
          </span>
        </a>
        <nav aria-label="주 메뉴">
          <a href="#field" className={page === 'field' ? 'active' : ''}>
            GPS 놀이
          </a>
          <a href="#home" className={page === 'home' ? 'active' : ''}>
            감정소
          </a>
          <a href="#map" className={page === 'map' ? 'active' : ''}>
            <Globe2 size={16} />
            관측 지도
          </a>
          <a href="#analysis" className={page === 'analysis' ? 'active' : ''}>
            <BarChart3 size={16} />
            지역 분석
          </a>
          <a
            href="#record"
            onClick={(e) => {
              e.preventDefault()
              startExam()
            }}
            className={`nav-record ${page === 'record' ? 'active' : ''}`}
          >
            <Plus size={16} />
            표본 등록
          </a>
        </nav>
      </header>
      <main>
        {((error && (page === 'map' || page === 'analysis')) || CONFIG_ERROR) && (
          <div className="error-banner" role="alert">
            <Info size={18} />
            <span>{CONFIG_ERROR || error}</span>
            <button onClick={() => void reload()}>다시 시도</button>
            {DEMO && (
              <button
                onClick={() => {
                  if (confirm('이 브라우저의 데모 기록을 모두 지울까요?')) {
                    resetDemo()
                    void reload()
                  }
                }}
              >
                데모 기록 초기화
              </button>
            )}
          </div>
        )}
        {page === 'home' && (
          <HomePage
            onStart={startExam}
            onPlay={() => navigate('field')}
            onExplore={() => navigate('map')}
          />
        )}
        {page === 'field' && (
          <Suspense fallback={<p role="status">GPS 놀이 준비 중…</p>}>
            <FieldPage
              onRecord={startExam}
              onDetail={(id) => {
                location.hash = `specimen=${id}`
              }}
            />
          </Suspense>
        )}
        {page === 'specimen' && (
          <Suspense fallback={<p role="status">표본 준비 중…</p>}>
            <SpecimenPage id={specimenId} />
          </Suspense>
        )}
        {page === 'certificate' &&
          (sharedCertificate ? (
            <CertificateView
              certificate={sharedCertificate}
              shared
              onStart={startExam}
              onMap={() => navigate('map')}
            />
          ) : (
            <section className="panel invalid-certificate">
              <h1>감정서 링크를 확인해 주세요.</h1>
              <p>링크가 잘렸거나 지원하지 않는 내용입니다. 친구에게 전체 링크를 다시 받아주세요.</p>
              <button className="primary" onClick={startExam}>
                내 코딱지 검사 시작
              </button>
            </section>
          ))}
        {page === 'map' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">
                  <span />
                  SMALL SPECIMENS. GLOBAL PERSPECTIVE.
                </p>
                <h1>
                  아주 작은 발견,
                  <br className="mobile-break" /> 지구를 읽는 새로운 관점.
                </h1>
                <p className="hero-description">
                  당신의 코딱지도 소중한 지질 자료입니다.
                  <br />
                  세계 곳곳의 작은 표본을 모아, 지역과 날씨의 관계를 관측합니다.
                </p>
              </div>
              <button className="primary hero-cta" onClick={startExam}>
                <Plus size={18} />
                나의 표본 등록하기
                <ArrowRight size={17} />
              </button>
            </section>
            <section className="overview" aria-label="선택 기간 관측 요약">
              <div>
                <span>
                  <Layers size={16} />
                  누적 관측 표본 <small>선택 기간</small>
                </span>
                <p>
                  {ready ? summary.count.toLocaleString() : '—'}
                  <small>개</small>
                </p>
              </div>
              <div>
                <span>
                  <MapPin size={16} />
                  관측 참여 지역
                </span>
                <p>
                  {ready ? activeRegions.length : '—'}
                  <small>개 지역 / {activeCountries}개국</small>
                </p>
              </div>
              <div>
                <span>
                  <FlaskConical size={16} />전 세계 평균 건조도
                </span>
                <p>
                  {ready ? summary.average?.toFixed(1) || '—' : '—'}
                  <small>/ 5 {ready && summary.count === 0 && '· 자료 없음'}</small>
                </p>
              </div>
              <div className="overview-note">
                <span className="status-dot" />
                <div>
                  <strong>{DEMO ? '로컬 데모 관측망' : '시민 관측망 운영 중'}</strong>
                  <small>작은 기록이 모여 지도가 됩니다.</small>
                </div>
              </div>
            </section>
            <section className="observatory">
              <div className="section-heading">
                <div className="inline-heading">
                  <h2>세계 코딱지 관측 지도</h2>
                  <span className="tag">GLOBAL ATLAS</span>
                </div>
                <span className="muted small desktop-only">
                  국가 또는 지역을 선택해 관측 현황을 살펴보세요.
                </span>
              </div>
              <div className="map-toolbar">
                <div>
                  <span className="toolbar-label">관측 기간</span>
                  <DateFilters value={filters} onChange={setFilters} />
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setFilters({ from: shiftDate(today, -29), to: today })
                    select(null)
                  }}
                >
                  최근 30일 보기
                  <ArrowDown size={13} />
                </button>
              </div>
              {validateFilters(filters) && (
                <p role="alert" className="field-error">
                  {validateFilters(filters)}
                </p>
              )}
              <div className="atlas-layout">
                <WorldMap
                  status={mapStatus}
                  regions={[
                    ...data.regions,
                    ...(selected && !data.regions.some((r) => r.id === selected.id)
                      ? [selected]
                      : []),
                  ]}
                  cells={filtered}
                  selected={selected}
                  onSelect={select}
                  onCountry={(code) => {
                    setCountry(code)
                    setSelected(null)
                  }}
                />
                <aside className="map-sidebar">
                  <RegionPicker value={selected} onChange={select} />
                  <div className="sidebar-divider" />
                  <div className="region-heading">
                    <span className="eyebrow">REGIONAL OBSERVATION</span>
                    <h3>
                      {selected?.name || (country ? countryName(country) : '어디를 살펴볼까요?')}
                    </h3>
                    <p>
                      {selected
                        ? `${selected.country} · ${selected.admin1}`
                        : country
                          ? '국가별 집계 · 하위 지역을 선택하세요.'
                          : '지역을 검색하거나 지도에서 선택해 주세요.'}
                    </p>
                  </div>
                  <div className="local-numbers">
                    <div>
                      <span>관측 표본</span>
                      <strong>
                        {ready && (selected || country) ? local.count : '—'}
                        <small>개</small>
                      </strong>
                    </div>
                    <div>
                      <span>평균 건조도</span>
                      <strong>
                        {ready ? local.average?.toFixed(1) || '—' : '—'}
                        <small>/ 5</small>
                      </strong>
                    </div>
                  </div>
                  {ready && local.count ? (
                    <Distribution cells={regionCells} compact />
                  ) : (
                    <div className="no-sample">
                      <FlaskConical size={22} />
                      <p>
                        {!ready
                          ? mapStatus
                          : selected || country
                            ? '아직 관측 데이터가 없습니다.'
                            : '작은 발견을 기다리고 있습니다.'}
                      </p>
                      <small>관측되지 않은 수치는 표시하지 않습니다.</small>
                    </div>
                  )}
                  {country && (
                    <div className="country-regions">
                      {data.regions
                        .filter((r) => r.countryCode === country)
                        .map((r) => (
                          <button key={r.id} onClick={() => select(r)}>
                            {r.name}
                            <span>
                              {summarize(filtered.filter((c) => c.regionId === r.id)).count}개{' '}
                              <ChevronRight size={13} />
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                  <button
                    className="outline full"
                    disabled={!selected}
                    onClick={() => navigate('analysis')}
                  >
                    지역 분석 자세히 보기
                    <ArrowRight size={15} />
                  </button>
                  <p className="privacy-note">
                    <ShieldCheck size={13} />
                    정확한 개인 위치는 수집하지 않습니다.
                  </p>
                </aside>
              </div>
              <div className="map-footnote">
                <span>
                  <Info size={13} />
                  지도는 행정구역별 집계를 표시하며, 점은 지역의 대표 지점입니다.
                </span>
                <span>경계: Natural Earth · 검색: © OpenStreetMap 기여자</span>
              </div>
            </section>
            <Suspense fallback={<p>GPS 표본 지도 준비 중…</p>}>
              <FieldAtlas />
            </Suspense>
            <section className="mission-grid">
              <article>
                <span className="mission-number">01 / COLLECT</span>
                <h3>10초의 작은 기록</h3>
                <p>
                  색상, 크기, 건조도. 간단한 기록으로
                  <br />
                  세계 코딱지 관측에 참여하세요.
                </p>
                <button className="text-button" onClick={startExam}>
                  첫 표본 등록하기
                  <ArrowRight size={15} />
                </button>
              </article>
              <article>
                <span className="mission-number">02 / OBSERVE</span>
                <h3>날씨와 만나는 표본</h3>
                <p>
                  지역의 기온과 습도를 함께 살펴보고,
                  <br />
                  작은 표본에 담긴 변화를 발견합니다.
                </p>
                <span className="mission-bottom">실제 기상자료 · Open-Meteo</span>
              </article>
              <article>
                <span className="mission-number">03 / UNDERSTAND</span>
                <h3>진지하게, 그러나 겸손하게</h3>
                <p>
                  아직은 탐구의 시작입니다. 충분한 자료가
                  <br />
                  모일 때까지 성급한 예측은 하지 않습니다.
                </p>
                <span className="mission-bottom">과학적 인과관계는 검증되지 않았습니다.</span>
              </article>
            </section>
          </>
        )}
        {page === 'record' && (
          <RecordPage
            key={examKey}
            onHome={() => navigate('home')}
            selected={selected}
            onSelect={select}
            onComplete={async () => {
              await reload()
            }}
            onMap={() => navigate('map')}
            onAnalysis={() => navigate('analysis')}
          />
        )}
        {page === 'analysis' && (loading || !!error) && (
          <div className="panel analysis-empty">{mapStatus}</div>
        )}
        {page === 'analysis' && !loading && !error && (
          <AnalysisPage
            selected={selected}
            onSelect={select}
            data={data}
            filters={filters}
            setFilters={setFilters}
            onRecord={startExam}
          />
        )}
      </main>
      <footer className="site-footer">
        <div>
          <strong>BOOGER ATLAS</strong>
          <span>세계 코딱지 지질조사국</span>
        </div>
        <p>아주 작은 발견에, 쓸데없이 진지한 감정서.</p>
        <span>© {new Date().getFullYear()} BOOGER ATLAS</span>
      </footer>
    </>
  )
}
export default App
