import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowRight, BarChart3, Globe2, Info, Layers, MapPin, Plus, Sparkles } from 'lucide-react'
import RegionPicker from '../components/RegionPicker'
import WeatherPanel from '../components/WeatherPanel'
import HistoricalWeather from '../components/HistoricalWeather'
import { DateFilters, Distribution } from '../components/DataViews'
import { getWeather } from '../lib/api'
import {
  COLORS,
  dailySeries,
  filterCells,
  localDate,
  SEED_REGIONS,
  shiftDate,
  summarize,
  validateFilters,
} from '../lib/domain'
import type { Dataset, Filters, Region, WeatherDay } from '../lib/domain'
const TrendChart = lazy(() =>
  import('../components/Charts').then((m) => ({ default: m.TrendChart })),
)
export default function AnalysisPage({
  selected,
  onSelect,
  data,
  filters,
  setFilters,
  onRecord,
}: {
  selected: Region | null
  onSelect: (r: Region | null) => void
  data: Dataset
  filters: Filters
  setFilters: (f: Filters) => void
  onRecord: () => void
}) {
  const [comparison, setComparison] = useState<Region | null>(null),
    [weather, setWeather] = useState<WeatherDay[]>([]),
    [weatherError, setWeatherError] = useState(false),
    [weatherLoading, setWeatherLoading] = useState(false)
  const cells =
      selected && !validateFilters(filters) ? filterCells(data.cells, filters, selected.id) : [],
    stats = summarize(cells)
  const recent = selected
    ? filterCells(data.cells, { from: shiftDate(localDate(), -29), to: localDate() }, selected.id)
    : []
  const recentStats = summarize(recent),
    top = [...recentStats.colors].sort((a, b) => b.count - a.count)[0],
    topSize = [...recentStats.sizes].sort((a, b) => b.count - a.count)[0]
  const dates = dailySeries(cells)
      .map((d) => d.date)
      .slice(-14),
    datesKey = dates.join(',')
  useEffect(() => {
    let active = true
    setWeather([])
    setWeatherError(false)
    if (!selected || !datesKey) {
      setWeatherLoading(false)
      return
    }
    setWeatherLoading(true)
    const region = selected
    void (async () => {
      const results: WeatherDay[] = []
      let failed = false
      for (const d of datesKey.split(',')) {
        if (!active) return
        try {
          results.push(...(await getWeather(region, d)))
        } catch {
          failed = true
        }
      }
      if (active) {
        setWeather(results)
        setWeatherError(failed)
        setWeatherLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [selected, datesKey])
  const compared = comparison ? summarize(filterCells(data.cells, filters, comparison.id)) : null
  return (
    <>
      <div className="page-title analysis-title">
        <div>
          <p className="eyebrow">REGIONAL RESEARCH REPORT</p>
          <h1>지역의 작은 흔적을 읽다.</h1>
          <p>표본의 특징부터 날씨와의 관계까지, 지역별 관측 보고서.</p>
        </div>
        <button className="primary" onClick={onRecord}>
          <Plus size={17} />
          표본 등록
        </button>
      </div>
      <div className="panel analysis-controls">
        <RegionPicker value={selected} onChange={onSelect} />
        <div>
          <label className="field-label">분석 기간</label>
          <DateFilters value={filters} onChange={setFilters} />
          {validateFilters(filters) && (
            <p className="field-error" role="alert">
              {validateFilters(filters)}
            </p>
          )}
        </div>
      </div>
      {!selected ? (
        <div className="panel analysis-empty">
          <Globe2 size={42} strokeWidth={1} />
          <h2>분석할 지역을 선택해 주세요.</h2>
          <p>지역을 검색하면 관측 분포와 실제 기상예보를 확인할 수 있습니다.</p>
          <div className="quick-regions">
            {SEED_REGIONS.map((r) => (
              <button key={r.id} onClick={() => onSelect(r)}>
                {r.name}
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="analysis-region-title">
            <h2>
              <MapPin size={21} />
              {selected.admin1} {selected.name}
            </h2>
            <span>
              {selected.country} · {filters.from} — {filters.to}
            </span>
          </div>
          <div className="analysis-stats">
            <div className="panel">
              <span>관측 표본</span>
              <strong>
                {stats.count}
                <small>개</small>
              </strong>
            </div>
            <div className="panel">
              <span>평균 건조도</span>
              <strong>
                {stats.average?.toFixed(1) || '—'}
                <small>/ 5</small>
              </strong>
            </div>
            <div className="panel">
              <span>관측 일수</span>
              <strong>
                {dailySeries(cells).length}
                <small>일</small>
              </strong>
            </div>
          </div>
          <div className="analysis-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SPECIMEN PROFILE</p>
                  <h2>코딱지 특징 분포</h2>
                </div>
                <Layers size={22} />
              </div>
              <Distribution cells={cells} />
            </section>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DAILY OBSERVATIONS</p>
                  <h2>건조도와 날씨의 변화</h2>
                </div>
                <BarChart3 size={22} />
              </div>
              <Suspense fallback={<p className="loading-text">그래프 준비 중…</p>}>
                <TrendChart cells={cells} weather={weather} />
              </Suspense>
              <p className="source-note">
                건조도는 시민 관측 평균 · 기상은 일평균 모델 자료입니다. 기온은 독립 축이므로 선의
                교차는 의미가 없습니다.
              </p>
              {weatherLoading && (
                <p className="muted small" aria-live="polite">
                  지역·날짜별 기상자료 연결 중…
                </p>
              )}
              {weatherError && (
                <p className="muted small">
                  일부 기상자료: 자료 없음. 누락된 값을 추정하지 않았습니다.
                </p>
              )}
              {dates.length > 0 && (
                <p className="muted small">
                  그래프 기상 자동 조회는 최근 관측일 14개로 제한되며, 다른 날짜는 아래에서 조회할
                  수 있습니다. 과거 5일 이전은 ERA5 재분석, 최근 과거는 모델 자료, 오늘은
                  예보입니다.
                </p>
              )}
              <HistoricalWeather
                key={selected.id}
                region={selected}
                dates={dailySeries(cells).map((d) => d.date)}
              />
            </section>
            <WeatherPanel key={selected.id} region={selected} />
            <section className="panel prediction-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">BOOGER OUTLOOK</p>
                  <h2>코딱지 관측 전망</h2>
                </div>
                <Sparkles size={23} />
              </div>
              <span className="tag">실험 준비 단계</span>
              <h3>분석을 위한 데이터 수집 중</h3>
              <p>
                날씨로 코딱지를 예측하는 모델은 아직 검증되지 않았습니다. 첫 버전에서는 코딱지
                예측을 제공하지 않습니다.
              </p>
              <div className="recent-pattern">
                <span>최근 30일 · {recentStats.count}개 표본</span>
                <strong>
                  {recentStats.count
                    ? `주요 색상 ${top.label} · 크기 ${topSize.label}`
                    : '아직 관측 데이터가 없습니다.'}
                </strong>
                <small>
                  {recentStats.count
                    ? `평균 건조도 ${recentStats.average?.toFixed(1)} / 5 · 동률은 색상·크기 표시 순서 기준`
                    : '최근 관측이 쌓이면 자주 등록된 유형을 보여드립니다.'}
                </small>
              </div>
              <p className="source-note">
                <Info size={13} />
                관측 경향이며, 의학적 판단이나 과학적 예보가 아닙니다.
              </p>
            </section>
          </div>
          <section className="panel comparison-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">REGION COMPARISON</p>
                <h2>다른 지역과 비교하기</h2>
              </div>
            </div>
            <RegionPicker value={comparison} onChange={setComparison} label="비교 지역 검색" />
            {comparison && compared && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>선택 기간 기준</th>
                      <th>{selected.name}</th>
                      <th>{comparison.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>관측 표본 수</td>
                      <td>{stats.count}개</td>
                      <td>{compared.count}개</td>
                    </tr>
                    <tr>
                      <td>평균 건조도</td>
                      <td>{stats.average?.toFixed(1) || '자료 없음'}</td>
                      <td>{compared.average?.toFixed(1) || '자료 없음'}</td>
                    </tr>
                    {COLORS.map((c) => (
                      <tr key={c.id}>
                        <td>{c.label} 표본</td>
                        <td>{stats.colors.find((x) => x.id === c.id)?.count}개</td>
                        <td>{compared.colors.find((x) => x.id === c.id)?.count}개</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="source-note">
              지역별 표본 수와 참여자의 차이가 있으므로 단순 비교로 인과관계를 판단할 수 없습니다.
            </p>
          </section>
        </>
      )}
    </>
  )
}
