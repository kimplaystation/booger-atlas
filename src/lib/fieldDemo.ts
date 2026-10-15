import {
  FIELD_STORE,
  born,
  createField,
  distance,
  publicSpecimen,
  DEFAULT_RADIUS,
  validateTraits,
  validPosition,
} from '../../supabase/functions/_shared/field'
import type {
  FieldSpecimen,
  LifeEvent,
  Position,
  Traits,
} from '../../supabase/functions/_shared/field'
import type { Region } from './domain'
interface Store {
  specimens: FieldSpecimen[]
  events: Record<string, LifeEvent[]>
}
export function readFieldDemo(): Store {
  try {
    const raw = localStorage.getItem(FIELD_STORE)
    if (!raw) return { specimens: [], events: {} }
    const data = JSON.parse(raw)
    if (
      !Array.isArray(data.specimens) ||
      !data.events ||
      data.specimens.some(
        (s: FieldSpecimen) =>
          !validateTraits({ ...s, dryness: Math.round(s.dryness) }) || !validPosition(s.position),
      )
    )
      throw Error('invalid')
    return data
  } catch {
    throw Error('GPS 데모 저장소를 읽을 수 없습니다. 브라우저 저장 설정을 확인해 주세요.')
  }
}
export function saveFieldDemo(input: {
  id: string
  traits: Traits
  region: Region
  position: Position
  accuracy?: number
  indoor: boolean
  publicLocation: boolean
}) {
  const data = readFieldDemo(),
    old = data.specimens.find((s) => s.id === input.id)
  if (old) return publicSpecimen(old, data.events[old.id], undefined, true)
  if (data.specimens.filter((s) => Date.now() - Date.parse(s.createdAt) < 600000).length >= 5)
    throw Error('10분에 최대 5건까지 등록할 수 있습니다.')
  const s = createField(
    input.id,
    input.traits,
    input.region,
    input.position,
    input.indoor,
    input.publicLocation,
    new Date(),
    input.accuracy,
  )
  data.specimens.push(s)
  data.events[s.id] = [born(s)]
  try {
    localStorage.setItem(FIELD_STORE, JSON.stringify(data))
  } catch {
    throw Error('저장 공간이 부족하거나 차단되어 GPS 표본을 저장하지 못했습니다.')
  }
  return publicSpecimen(s, data.events[s.id], undefined, true)
}
export function nearbyDemo(position: Position, radius = DEFAULT_RADIUS) {
  const data = readFieldDemo()
  return data.specimens
    .filter((s) => s.status === 'alive' && distance(position, s.position) <= radius)
    .map((s) => publicSpecimen(s, undefined, position, true))
    .sort((a, b) => a.distanceMeters! - b.distanceMeters!)
}
