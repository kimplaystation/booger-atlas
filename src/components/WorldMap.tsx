import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap, ZoomControl } from 'react-leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Cell, Region } from '../lib/domain'
import { Globe2, Layers, Maximize } from 'lucide-react'
function Focus({ region }: { region: Region | null }) {
  const map = useMap()
  useEffect(() => {
    if (region) map.flyTo([region.latitude, region.longitude], 5, { duration: 0.8 })
    else
      map.fitBounds(
        [
          [-57, -176],
          [80, 180],
        ],
        { padding: [15, 40], animate: false },
      )
  }, [region, map])
  return (
    <button
      className="map-reset"
      aria-label="세계 전체 보기"
      onClick={() =>
        map.fitBounds(
          [
            [-57, -176],
            [80, 180],
          ],
          { padding: [15, 40], animate: true },
        )
      }
    >
      <Maximize size={16} />
    </button>
  )
}
const names = new Intl.DisplayNames(['ko'], { type: 'region' })
export function countryName(code: string, fallback = '지역 미상') {
  return /^[A-Z]{2}$/.test(code) ? names.of(code) || fallback : fallback
}
export default function WorldMap({
  regions,
  cells,
  selected,
  onSelect,
  onCountry,
  status = '',
}: {
  status?: string
  regions: Region[]
  cells: Cell[]
  selected: Region | null
  onSelect: (r: Region) => void
  onCountry: (code: string) => void
}) {
  const [geo, setGeo] = useState<GeoJsonObject | null>(null),
    [failed, setFailed] = useState(false)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cells) m.set(c.regionId, (m.get(c.regionId) || 0) + c.count)
    return m
  }, [cells])
  const countries = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of regions)
      m.set(r.countryCode, (m.get(r.countryCode) || 0) + (counts.get(r.id) || 0))
    return m
  }, [counts, regions])
  useEffect(() => {
    fetch('/world.geojson')
      .then((r) => {
        if (!r.ok) throw Error()
        return r.json()
      })
      .then(setGeo)
      .catch(() => setFailed(true))
  }, [])
  const markers = regions.filter((r) => counts.has(r.id) || r.id === selected?.id)
  const signature = JSON.stringify([...countries]) + status
  return (
    <div className="world-map">
      <div className="map-caption">
        <span className="live-dot" />
        행정구역별 관측망 <span className="map-caption-secondary">/ GLOBAL OBSERVATORY</span>
      </div>
      <MapContainer
        center={[22, 15]}
        zoom={2}
        minZoom={0}
        zoomSnap={0.25}
        maxZoom={8}
        zoomControl={false}
        scrollWheelZoom={false}
        attributionControl={true}
        worldCopyJump={false}
        maxBounds={[
          [-85, -220],
          [85, 220],
        ]}
      >
        {geo && (
          <GeoJSON
            key={signature}
            data={geo}
            attribution="경계: Natural Earth · 공공 영역"
            style={(feature) => ({
              color: '#becac0',
              weight: 0.7,
              fillColor: (countries.get(feature?.properties.code) || 0) > 0 ? '#86a88c' : '#dce4da',
              fillOpacity: 1,
            })}
            onEachFeature={(feature: Feature, layer) => {
              const code = feature.properties?.code
              const count = countries.get(code) || 0
              const content = document.createElement('div')
              content.textContent = `${countryName(code, feature.properties?.name)} · ${status || (count ? `${count.toLocaleString()}개 표본` : '관측 데이터 없음')}`
              layer.bindTooltip(content, { sticky: true })
              layer.on('click', () => onCountry(code))
            }}
          />
        )}
        {markers.map((r) => (
          <CircleMarker
            key={r.id}
            center={[r.latitude, r.longitude]}
            radius={
              r.id === selected?.id ? 11 : Math.min(7 + Math.log2((counts.get(r.id) || 1) + 1), 20)
            }
            pathOptions={{
              color: r.id === selected?.id ? '#1d4736' : '#487859',
              fillColor: '#5d8664',
              fillOpacity: 0.55,
              weight: 2,
            }}
            eventHandlers={{ click: () => onSelect(r) }}
          >
            <Tooltip>
              {r.admin1} {r.name} · {counts.get(r.id) || 0}개 표본
            </Tooltip>
          </CircleMarker>
        ))}
        <ZoomControl position="bottomleft" />
        <Focus region={selected} />
      </MapContainer>
      {failed && (
        <p className="map-empty">
          세계 경계 지도를 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.
        </p>
      )}
      {(!cells.length || status) && !failed && (
        <div className="map-empty">
          <Globe2 size={19} />
          <span>
            아직 관측된 표본이 없습니다.
            {!status && <small>첫 번째 관측으로 세계 지도를 채워 주세요.</small>}
          </span>
        </div>
      )}
      <div className="map-legend">
        <Layers size={14} />
        <span>지역 대표 지점</span>
        <i />
        <span>표본이 있는 국가</span>
      </div>
    </div>
  )
}
