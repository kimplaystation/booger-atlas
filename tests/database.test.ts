import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  await db.exec(await readFile('supabase/migrations/202610150001_atlas.sql', 'utf8'))
})
afterAll(async () => {
  await db.close()
})
describe('실제 PostgreSQL 마이그레이션과 보안', () => {
  it('지역만 초기화하고 가짜 표본은 넣지 않는다', async () => {
    const r = await db.query<{ dataset: { regions: unknown[]; cells: unknown[] } }>(
      'select atlas_dataset() as dataset',
    )
    expect(r.rows[0].dataset.regions).toHaveLength(5)
    expect(r.rows[0].dataset.cells).toEqual([])
  })
  it('anon과 authenticated는 원본 읽기·쓰기·집계 RPC를 직접 실행할 수 없다', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const q of [
        'select * from atlas_observations',
        'select * from atlas_regions',
        'select atlas_dataset()',
        "insert into atlas_observations values('00000000-0000-4000-8000-000000000001','kr:legal:11680','2026-01-01','yellow','small',3,now())",
      ]) {
        await expect(db.exec(q)).rejects.toThrow(/permission denied/)
      }
      await db.exec('reset role')
    }
  })
  it('서버의 유효한 기록은 집계하고 잘못된 값과 지역은 거부한다', async () => {
    await db.exec(
      "insert into atlas_observations(id,region_id,found_on,color,size,dryness) values('00000000-0000-4000-8000-000000000001','kr:legal:11680','2026-01-01','yellow','small',3),('00000000-0000-4000-8000-000000000002','kr:legal:11680','2026-01-01','yellow','small',3)",
    )
    const r = await db.query<{ dataset: { cells: { count: number }[] } }>(
      'select atlas_dataset() as dataset',
    )
    expect(r.rows[0].dataset.cells[0].count).toBe(2)
    await expect(
      db.exec(
        "insert into atlas_observations(id,region_id,found_on,color,size,dryness) values('00000000-0000-4000-8000-000000000003','kr:legal:11680','2026-01-01','yellow','small',6)",
      ),
    ).rejects.toThrow(/check constraint/)
    await expect(
      db.exec(
        "insert into atlas_observations(id,region_id,found_on,color,size,dryness) values('00000000-0000-4000-8000-000000000004','osm:relation:999','2026-01-01','yellow','small',3)",
      ),
    ).rejects.toThrow(/foreign key/)
  })
  it('DB 원자적 제한으로 여섯 번째 등록을 막는다', async () => {
    for (let i = 0; i < 6; i++) {
      const r = await db.query<{ ok: boolean }>("select atlas_take_rate('test',5,600) as ok")
      expect(r.rows[0].ok).toBe(i < 5)
    }
  })
  it('Nominatim 전체 요청을 1.1초 간격으로 제한한다', async () => {
    const a = await db.query<{ ok: boolean }>('select atlas_take_geocoder_slot() as ok')
    const b = await db.query<{ ok: boolean }>('select atlas_take_geocoder_slot() as ok')
    expect(a.rows[0].ok).toBe(true)
    expect(b.rows[0].ok).toBe(false)
  })
  it('모든 테이블에 RLS가 활성화되어 있다', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname like 'atlas_%' and relkind='r'",
    )
    expect(r.rows).toHaveLength(5)
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true)
  })
})
