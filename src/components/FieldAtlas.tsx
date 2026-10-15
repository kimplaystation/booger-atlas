import { Fragment, useEffect, useState } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { worldField, lifeAge } from '../lib/fieldApi'
import type { Position, PublicSpecimen } from '../lib/fieldApi'
import type { GPSFix } from '../ar/geo'
import { COLORS } from '../lib/domain'
import { currentMapWeather, weatherLabel } from '../lib/mapWeather'
import type { MapWeather } from '../lib/mapWeather'
function Focus({ point, zoom }: { point: Position; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([point.latitude, point.longitude], zoom)
  }, [map, point.latitude, point.longitude, zoom])
  return null
}
function PickWeather({ onPick }: { onPick: (p: Position) => void }) {
  useMapEvents({ click: (e) => onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }) })
  return null
}
function accuracyLabel(s: PublicSpecimen) {
  return s.accuracyMeters === undefined
    ? '이전 기록 · 20m 격자 · GPS 오차 미기록'
    : `GPS 오차 약 ${Math.ceil(s.accuracyMeters)}m`
}
export default function FieldAtlas({
  selected,
  current,
}: {
  selected?: PublicSpecimen
  current?: GPSFix | null
}) {
  const [mine, setMine] = useState<GPSFix | null>(current ?? null),
    [gpsError, setGpsError] = useState(''),
    [rows, setRows] = useState<PublicSpecimen[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!selected),
    [filter, setFilter] = useState('all'),
    [focus, setFocus] = useState<{ point: Position; zoom: number } | null>(null),
    [weatherPoint, setWeatherPoint] = useState<Position | null>(
      selected?.position ?? current?.position ?? null,
    ),
    [weather, setWeather] = useState<MapWeather | null>(null),
    [weatherError, setWeatherError] = useState(''),
    [weatherBusy, setWeatherBusy] = useState(false),
    [tileError, setTileError] = useState(false)
  useEffect(() => {
    if (current) {
      setMine(current)
      setFocus({ point: current.position, zoom: 18 })
      setWeatherPoint(current.position)
    }
  }, [current])
  function locate() {
    if (!navigator.geolocation) {
      setGpsError('GPS를 지원하지 않습니다.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const f = {
          position: { latitude: p.coords.latitude, longitude: p.coords.longitude },
          accuracy: p.coords.accuracy,
          time: p.timestamp,
        }
        setMine(f)
        setFocus({ point: f.position, zoom: 18 })
        setWeatherPoint(f.position)
        setGpsError('')
      },
      () => setGpsError('현재 위치를 확인하지 못했습니다. GPS 권한을 확인해 주세요.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 },
    )
  }
  useEffect(() => {
    let active = true
    if (selected) {
      setRows([selected])
      setLoading(false)
    } else
      void worldField()
        .then((s) => {
          if (!active) return
          setRows(s)
          const own = s.find((x) => x.isOwner && x.position)
          if (own?.position && !current) {
            setFocus({ point: own.position, zoom: 18 })
            setWeatherPoint(own.position)
          }
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : 'GPS 표본 조회 실패')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    return () => {
      active = false
    }
  }, [selected])
  useEffect(() => {
    let active = true
    setWeather(null)
    setWeatherError('')
    if (!weatherPoint) return
    setWeatherBusy(true)
    void currentMapWeather(weatherPoint)
      .then((w) => {
        if (active) setWeather(w)
      })
      .catch(() => {
        if (active) setWeatherError('기상자료 없음 · 잠시 후 다른 지점을 선택해 주세요')
      })
      .finally(() => {
        if (active) setWeatherBusy(false)
      })
    return () => {
      active = false
    }
  }, [weatherPoint])
  const visible = rows.filter((s) => filter === 'all' || s.status === filter)
  const center = selected?.position ?? current?.position
  const value = (n: number | null, unit: string) => (n === null ? '자료 없음' : `${n}${unit}`)
  return (
    <section className="panel field-atlas">
      <div className="field-map-heading">
        <div>
          <h2>GPS 표본 지도</h2>
          <p>
            내 표본은 저장 좌표에 표시 · 다른 사람의 공개 위치는 약 500m 단위 · 비공개는 지역 대표점
          </p>
        </div>
        <select
          aria-label="GPS 표본 상태 필터"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">생존 + 소멸</option>
          <option value="alive">살아 있는 표본</option>
          <option value="dissolved">소멸한 표본</option>
        </select>
      </div>
      <div className="map-actions">
        <button className="text-button" onClick={locate}>
          내 현재 위치 보기 · 저장하지 않음
        </button>
        {selected?.position && (
          <button
            className="text-button"
            onClick={() => {
              setFocus({ point: selected.position!, zoom: selected.isOwner ? 18 : 14 })
              setWeatherPoint(selected.position!)
            }}
          >
            표본 위치로 돌아가기
          </button>
        )}
      </div>
      {gpsError && (
        <p role="alert" className="field-error">
          {gpsError}
        </p>
      )}
      {error ? (
        <p role="alert">{error}</p>
      ) : loading ? (
        <p role="status">GPS 표본을 불러오는 중…</p>
      ) : (
        <>
          <div className="weather-map">
            <MapContainer
              key={selected?.id || 'world'}
              center={center ? [center.latitude, center.longitude] : [25, 15]}
              zoom={center ? (selected && !selected.isOwner ? 14 : 18) : 2}
              minZoom={1}
              maxZoom={19}
              scrollWheelZoom={false}
              className="field-leaflet"
            >
              <TileLayer
                url={
                  import.meta.env.DEV
                    ? '/external/tiles/{z}/{x}/{y}.png'
                    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                }
                maxZoom={19}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                eventHandlers={{ tileerror: () => setTileError(true), load: () => {} }}
              />
              {focus && <Focus {...focus} />}
              <PickWeather onPick={setWeatherPoint} />
              {mine && (
                <>
                  <Circle
                    center={[mine.position.latitude, mine.position.longitude]}
                    radius={mine.accuracy}
                    pathOptions={{ color: '#387bc0', weight: 1, fillOpacity: 0.07 }}
                  />
                  <CircleMarker
                    center={[mine.position.latitude, mine.position.longitude]}
                    radius={6}
                    pathOptions={{ color: '#fff', fillColor: '#387bc0', weight: 2, fillOpacity: 1 }}
                  >
                    <Tooltip>내 현재 위치 · 오차 약 {Math.ceil(mine.accuracy)}m</Tooltip>
                  </CircleMarker>
                </>
              )}
              {visible.map((s) => {
                const p = s.position || s.region
                return (
                  <Fragment key={s.id}>
                    {s.isOwner && s.position && (
                      <Circle
                        center={[p.latitude, p.longitude]}
                        radius={s.accuracyMeters ?? 20}
                        pathOptions={{
                          color: '#647c32',
                          weight: 1,
                          dashArray: '4 4',
                          fillOpacity: 0.08,
                        }}
                      />
                    )}
                    <CircleMarker
                      center={[p.latitude, p.longitude]}
                      radius={s.isOwner ? 10 : 8}
                      eventHandlers={{ click: () => setWeatherPoint(p) }}
                      pathOptions={{
                        color: s.status === 'alive' ? '#344d19' : '#7e746b',
                        fillColor: COLORS.find((c) => c.id === s.color)?.hex,
                        fillOpacity: 1,
                        weight: 3,
                        dashArray: s.position ? undefined : '3 3',
                      }}
                    >
                      <Tooltip permanent={!!selected} direction="top" offset={[0, -10]}>
                        {s.isOwner ? '내 코딱지' : s.region.name} ·{' '}
                        {s.status === 'alive' ? '생존' : '소멸'}
                      </Tooltip>
                      <Popup>
                        <strong>
                          {s.region.name} · {s.status === 'alive' ? '생존' : '소멸'}
                        </strong>
                        <p>
                          {s.isOwner
                            ? `내 저장 위치 · ${accuracyLabel(s)}`
                            : s.position
                              ? '공개용 대략적 위치 · 약 500m 단위'
                              : '개별 위치 비공개 · 행정구역 대표점'}
                        </p>
                        <a href={`#specimen=${s.id}`}>저장 위치와 카메라 보기</a>
                      </Popup>
                    </CircleMarker>
                  </Fragment>
                )
              })}
              {(selected?.isOwner || selected?.publicLocation) && selected.events && (
                <Polyline
                  positions={selected.events.flatMap((e) =>
                    e.position
                      ? [[e.position.latitude, e.position.longitude] as [number, number]]
                      : [],
                  )}
                  pathOptions={{ color: '#a5794c', weight: 3, dashArray: '5 7' }}
                />
              )}
              {weatherPoint && (
                <CircleMarker
                  center={[weatherPoint.latitude, weatherPoint.longitude]}
                  radius={17}
                  interactive={false}
                  pathOptions={{ color: '#4a8198', weight: 1, fill: false, dashArray: '2 4' }}
                />
              )}
            </MapContainer>
            <aside className="map-weather" aria-label="지도 위치의 기상정보" aria-live="polite">
              <strong>
                {weather
                  ? `${weatherLabel(weather.code)} · ${value(weather.temperature, '°C')}`
                  : '지도 위 현재 날씨'}
              </strong>
              {!weatherPoint ? (
                <p>지도를 누르거나 내 위치를 확인하세요</p>
              ) : weatherBusy ? (
                <p>기상정보 불러오는 중…</p>
              ) : weatherError ? (
                <p>{weatherError}</p>
              ) : (
                weather && (
                  <>
                    <div>
                      습도 {value(weather.humidity, '%')} · 강수{' '}
                      {value(weather.precipitation, 'mm')}
                    </div>
                    <div>
                      바람 {value(weather.windSpeed, 'm/s')} · {value(weather.windDirection, '°')}
                      에서
                    </div>
                    <small>
                      Open-Meteo 기상 모델
                      <br />
                      {new Date(weather.time).toLocaleString('ko-KR', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      기준
                    </small>
                  </>
                )
              )}
            </aside>
          </div>
          {tileError && (
            <p className="field-hint">
              일부 지도 배경을 불러오지 못했습니다. 연결을 확인하고 페이지를 새로고침하세요.
            </p>
          )}
          {selected?.isOwner && selected.position && (
            <p className="saved-coordinate">
              내 저장 좌표 {selected.position.latitude.toFixed(6)},{' '}
              {selected.position.longitude.toFixed(6)} · {accuracyLabel(selected)}
            </p>
          )}
          {visible.length === 0 && <p>표시할 GPS 표본이 없습니다.</p>}
          <p className="field-hint">
            초록 원: 저장 위치 오차 · 파란 점: 현재 위치 · 지도를 누르면 해당 지점의 실제 기상
            모델을 조회합니다. 이동 경로는 가상 게임 결과입니다.
          </p>
          <p className="field-hint">
            지도 배경: OpenStreetMap (보는 영역이 전송됨) · 기상 조회 좌표는 약 1km 단위로
            반올림합니다. 최근 처리된 표본 최대 500개.
          </p>
          {!selected && (
            <div className="field-world-list">
              {visible.slice(0, 12).map((s) => (
                <a href={`#specimen=${s.id}`} key={s.id}>
                  <span>
                    {s.isOwner ? '내 표본 · ' : ''}
                    {s.region.name} · {COLORS.find((c) => c.id === s.color)?.label}
                  </span>
                  <small>
                    {s.status === 'alive' ? '생존' : '소멸'} {lifeAge(s)}
                  </small>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
