import { createClient } from '@supabase/supabase-js'
import { CONFIG_ERROR, DEMO } from './api'
import { nearbyDemo, readFieldDemo, saveFieldDemo } from './fieldDemo'
import { DEFAULT_RADIUS, publicSpecimen } from '../../supabase/functions/_shared/field'
import type { Position, PublicSpecimen, Traits } from '../../supabase/functions/_shared/field'
import type { Region } from './domain'
export type { Position, PublicSpecimen, Traits }
const client =
  !DEMO && !CONFIG_ERROR
    ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null
async function invoke<T>(action: string, body: object = {}): Promise<T> {
  if (!client) throw Error(CONFIG_ERROR || '공동 저장 연결이 필요합니다.')
  const { data, error } = await client.functions.invoke('field', { body: { action, ...body } })
  if (error) {
    let message = 'GPS 표본 서버에 연결하지 못했습니다. 저장 결과를 확인할 수 없습니다.'
    try {
      message = (await error.context.json()).error || message
    } catch {
      /* Network */
    }
    throw Error(message)
  }
  return data as T
}
export const saveField = (input: {
  id: string
  traits: Traits
  region: Region
  position: Position
  accuracy: number
  indoor: boolean
  publicLocation: boolean
  startedAt: number
}) =>
  DEMO
    ? Promise.resolve().then(() => saveFieldDemo(input))
    : invoke<PublicSpecimen>('create', { ...input, regionId: input.region.id, region: undefined })
export async function nearbyField(position: Position) {
  return DEMO
    ? { specimens: nearbyDemo(position), radius: DEFAULT_RADIUS }
    : invoke<{ specimens: PublicSpecimen[]; radius: number }>('nearby', { position })
}
export async function worldField() {
  return DEMO
    ? readFieldDemo().specimens.map((s) => publicSpecimen(s))
    : invoke<PublicSpecimen[]>('world')
}
export async function getField(id: string) {
  if (!DEMO) return invoke<PublicSpecimen>('detail', { id })
  const d = readFieldDemo(),
    s = d.specimens.find((s) => s.id === id)
  if (!s)
    throw Error('이 브라우저에 없는 데모 표본입니다. 데모 표본은 다른 기기에 공유되지 않습니다.')
  return publicSpecimen(s, d.events[id])
}
export function fieldURL(id: string) {
  const u = new URL(location.href)
  u.search = ''
  u.hash = `specimen=${id}`
  return u.toString()
}
export function lifeAge(s: PublicSpecimen) {
  const end = s.status === 'dissolved' ? Date.parse(s.lastTick) : Date.now()
  const mins = Math.max(0, Math.floor((end - Date.parse(s.createdAt)) / 60000))
  return mins < 60
    ? `${mins}분`
    : mins < 1440
      ? `${Math.floor(mins / 60)}시간`
      : `${Math.floor(mins / 1440)}일 ${Math.floor((mins % 1440) / 60)}시간`
}
