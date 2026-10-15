import { useEffect, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, MapContainer, Polyline, Popup, useMap } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import { worldField, lifeAge } from '../lib/fieldApi'
import type { PublicSpecimen } from '../lib/fieldApi'
import { COLORS } from '../lib/domain'
function CurrentPosition({
  position,
}: {
  position: { latitude: number; longitude: number; accuracy: number }
}) {
  const map = useMap()
  useEffect(() => {
    map.setView([position.latitude, position.longitude], 14)
  }, [map, position])
  return (
    <>
      <Circle
        center={[position.latitude, position.longitude]}
        radius={position.accuracy}
        pathOptions={{ color: '#4c7890', weight: 1, fillOpacity: 0.1 }}
      />
      <CircleMarker
        center={[position.latitude, position.longitude]}
        radius={5}
        pathOptions={{ color: '#385f75', fillOpacity: 1 }}
      >
        <Popup>내 현재 위치 · 이 화면에서만 사용 · 오차 약 {Math.ceil(position.accuracy)}m</Popup>
      </CircleMarker>
    </>
  )
}
export default function FieldAtlas({ selected }: { selected?: PublicSpecimen }) {
  const [mine, setMine] = useState<{
      latitude: number
      longitude: number
      accuracy: number
    } | null>(null),
    [gpsError, setGpsError] = useState('')
  function locate() {
    if (!navigator.geolocation) {
      setGpsError('GPS를 지원하지 않습니다.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMine({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        })
        setGpsError('')
      },
      () => setGpsError('현재 위치를 확인하지 못했습니다. GPS 권한을 확인해 주세요.'),
      { timeout: 10000, maximumAge: 10000 },
    )
  }
  const [rows, setRows] = useState<PublicSpecimen[]>([]),
    [geo, setGeo] = useState<GeoJsonObject | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!selected),
    [filter, setFilter] = useState('all')
  useEffect(() => {
    let active = true
    void fetch(`${import.meta.env.BASE_URL}world.geojson`)
      .then((r) => {
        if (!r.ok) throw Error()
        return r.json()
      })
      .then((g) => {
        if (active) setGeo(g)
      })
      .catch(() => {})
    if (selected) {
      setRows([selected])
      setLoading(false)
    } else
      void worldField()
        .then((s) => {
          if (active) setRows(s)
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
  const visible = rows.filter((s) => filter === 'all' || s.status === filter),
    center = selected?.position
  return (
    <section className="panel field-atlas">
      <div className="field-map-heading">
        <div>
          <h2>GPS 표본 지도</h2>
          <p>공개 위치는 약 500m 단위 · 위치 비공개 표본은 행정구역 대표점에 표시</p>
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
      <button className="text-button" onClick={locate}>
        내 현재 위치 보기 · 저장하지 않음
      </button>
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
          <MapContainer
            key={selected?.id || 'world'}
            center={center ? [center.latitude, center.longitude] : [25, 15]}
            zoom={center ? 13 : 2}
            minZoom={1}
            maxZoom={15}
            scrollWheelZoom={false}
            className="field-leaflet"
          >
            {mine && <CurrentPosition position={mine} />}
            {geo && (
              <GeoJSON
                data={geo}
                style={{ color: '#a9b69a', weight: 1, fillColor: '#e4eadb', fillOpacity: 1 }}
              />
            )}
            {/* No third-party map tile requests: the private viewing location is not sent to a tile vendor. */}
            {visible.map((s) => {
              const p = s.position || s.region
              return (
                <CircleMarker
                  key={s.id}
                  center={[p.latitude, p.longitude]}
                  radius={s.position ? 8 : 11}
                  pathOptions={{
                    color: s.status === 'alive' ? '#566d3e' : '#8d8377',
                    fillColor: s.status === 'alive' ? '#8ba861' : '#b4aaa0',
                    fillOpacity: 0.8,
                    dashArray: s.position ? undefined : '3 3',
                  }}
                >
                  <Popup>
                    <strong>
                      {s.region.name} · {s.status === 'alive' ? '생존' : '소멸'}
                    </strong>
                    <p>
                      {s.position ? '공개용 대략적 위치' : '개별 위치 비공개 · 행정구역 대표점'}
                    </p>
                    <a href={`#specimen=${s.id}`}>표본 생애 보기</a>
                  </Popup>
                </CircleMarker>
              )
            })}
            {selected?.publicLocation && selected.events && (
              <Polyline
                positions={selected.events.flatMap((e) =>
                  e.position
                    ? [[e.position.latitude, e.position.longitude] as [number, number]]
                    : [],
                )}
                pathOptions={{ color: '#a5794c', weight: 3, dashArray: '5 7' }}
              />
            )}
          </MapContainer>
          {visible.length === 0 && <p>표시할 GPS 표본이 없습니다.</p>}
          <p className="field-hint">
            {selected
              ? '경로는 날씨에 따른 가상 이동입니다. 공개 위치 반올림으로 작은 이동은 겹쳐 보일 수 있습니다.'
              : '최근 처리된 GPS 표본 최대 500개입니다. 전체 누적 표본 통계는 위 관측 지도에서 확인하세요.'}
          </p>
          {!selected && (
            <div className="field-world-list">
              {visible.slice(0, 12).map((s) => (
                <a href={`#specimen=${s.id}`} key={s.id}>
                  <span>
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
