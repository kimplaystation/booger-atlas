import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { born, createField, simulateHour } from '../supabase/functions/_shared/field'
import { SEED_REGIONS } from '../src/lib/domain'
let db: PGlite
const s = createField(
  '00000000-0000-4000-8000-000000000011',
  { color: 'light-yellow', size: 'small', dryness: 5 },
  SEED_REGIONS[0],
  { latitude: 37.5172, longitude: 127.0473 },
  false,
  false,
  new Date('2026-01-01T00:00:00Z'),
)
beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  for (const name of ['202610150001_atlas.sql', '202610150002_field.sql'])
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
})
afterAll(async () => {
  await db.close()
})
describe('공동 GPS 표본 DB 원자성과 접근 제어', () => {
  it('새 스키마는 기존 집계를 보존하고 표본·생애를 원자적으로 한 번만 저장한다', async () => {
    for (let i = 0; i < 2; i++)
      await db.query('select atlas_field_create($1::jsonb,$2::jsonb)', [
        JSON.stringify(s),
        JSON.stringify(born(s)),
      ])
    expect((await db.query('select * from atlas_field_specimens')).rows).toHaveLength(1)
    expect((await db.query('select * from atlas_field_events')).rows).toHaveLength(1)
    const result = await db.query<{ d: { cells: { color: string; count: number }[] } }>(
      'select atlas_dataset() as d',
    )
    expect(result.rows[0].d.cells).toEqual([
      expect.objectContaining({ color: 'light-yellow', count: 1 }),
    ])
  })
  it('별도 읽기 요청에서 저장된 표본을 찾고 30m 밖에서는 발견하지 못한다', async () => {
    const near = await db.query<{ d: unknown[] }>('select atlas_field_nearby($1,$2,30) as d', [
      s.position.latitude,
      s.position.longitude,
    ])
    expect(near.rows[0].d).toHaveLength(1)
    const far = await db.query<{ d: unknown[] }>('select atlas_field_nearby(0,0,30) as d')
    expect(far.rows[0].d).toEqual([])
  })
  it('동시 cron 재시도는 한 번만 반영하고 소멸해도 이력을 유지한다', async () => {
    const r = simulateHour(s, {
      time: '2026-01-01T01:00:00.000Z',
      temperature: 20,
      humidity: 90,
      precipitation: 100,
      windSpeed: 10,
      windDirection: 0,
      source: 'TEST ONLY',
    })!
    const args = [s.id, 0, JSON.stringify(r.specimen), JSON.stringify(r.event)]
    const a = await db.query<{ ok: boolean }>(
        'select atlas_field_tick($1, $2, $3::jsonb, $4::jsonb) as ok',
        args,
      ),
      b = await db.query<{ ok: boolean }>(
        'select atlas_field_tick($1, $2, $3::jsonb, $4::jsonb) as ok',
        args,
      )
    expect(a.rows[0].ok).toBe(true)
    expect(b.rows[0].ok).toBe(false)
    expect((await db.query('select * from atlas_field_events')).rows).toHaveLength(2)
    expect(
      (await db.query<{ status: string }>('select status from atlas_field_specimens')).rows[0]
        .status,
    ).toBe('dissolved')
  })
  it('익명·인증 사용자는 위치 원본·생애 원본·서버 RPC에 접근하지 못한다', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const q of [
        'select * from atlas_field_specimens',
        'select * from atlas_field_events',
        'select atlas_field_nearby(0,0,30)',
        "select atlas_field_create('{}','{}')",
      ]) {
        await expect(db.exec(q)).rejects.toThrow(/permission denied/)
      }
      await db.exec('reset role')
    }
    const r = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname like 'atlas_field_%' and relkind='r'",
    )
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true)
  })
})
