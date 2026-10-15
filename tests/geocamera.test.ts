import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { cameraOrientation, cameraHeading, localPoint, throwPlacement } from '../src/ar/geo'
import {
  distance,
  move,
  createField,
  publicSpecimen,
  born,
} from '../supabase/functions/_shared/field'
import { hashOwnerKey, isOwner } from '../supabase/functions/_shared/ownership'
import { SEED_REGIONS } from '../src/lib/domain'
const origin = { latitude: 37.517212345, longitude: 127.047312345 }
describe('GPS 카메라의 고정 좌표계', () => {
  it('북·동·남·서 방향에서 카메라의 전방이 해당 지리 방향을 향한다', () => {
    for (const heading of [0, 90, 180, 270]) {
      const q = cameraOrientation({
        alpha: (360 - heading) % 360,
        beta: 90,
        gamma: 0,
        absolute: true,
      })!
      expect(cameraHeading(q)).toBeCloseTo(heading)
      const target = localPoint(origin, move(origin, 20, heading)).normalize()
      expect(new Vector3(0, 0, -1).applyQuaternion(q).dot(target)).toBeCloseTo(1)
    }
  })
  it('내 위치만 이동하면 같은 표본의 월드 좌표는 유지하고 상대 거리가 변한다', () => {
    const target = move(origin, 10, 0),
      object = localPoint(origin, target)
    const before = object.clone().sub(localPoint(origin, origin))
    const after = object.clone().sub(localPoint(origin, move(origin, 6, 0)))
    expect(before.length()).toBeCloseTo(10)
    expect(after.length()).toBeCloseTo(4)
    expect(object.z).toBeCloseTo(-10)
  })
  it('pitch·화면 회전과 iOS 나침반을 반영하고 상대 alpha를 북쪽으로 오인하지 않는다', () => {
    expect(cameraOrientation({ alpha: 10, beta: 60, gamma: 0 })).toBeNull()
    expect(
      cameraOrientation({
        alpha: null,
        beta: 60,
        gamma: 0,
        webkitCompassHeading: 90,
        webkitCompassAccuracy: -1,
      }),
    ).toBeNull()
    const portrait = cameraOrientation({ alpha: 0, beta: 60, gamma: 0, absolute: true })!
    const landscape = cameraOrientation({ alpha: 0, beta: 60, gamma: 0, absolute: true }, 90)!
    expect(new Vector3(0, 0, -1).applyQuaternion(portrait).y).toBeLessThan(0)
    expect(
      new Vector3(0, 1, 0)
        .applyQuaternion(portrait)
        .distanceTo(new Vector3(0, 1, 0).applyQuaternion(landscape)),
    ).toBeGreaterThan(1)
    const ios = cameraOrientation({
      alpha: 123,
      beta: 90,
      gamma: 0,
      webkitCompassHeading: 90,
      webkitCompassAccuracy: 10,
    })!
    expect(cameraHeading(ios)).toBeCloseTo(90)
  })
  it('발사 시점의 GPS·방향으로 앞쪽 2m를 정하고 방향 미확인은 원래 GPS를 보존한다', () => {
    const fix = { position: origin, accuracy: 12, time: 123 }
    const target = throwPlacement(fix, 90)
    expect(distance(origin, target.position)).toBeCloseTo(2)
    expect(target.position.longitude).toBeGreaterThan(origin.longitude)
    expect(target.time).toBe(123)
    expect(throwPlacement(fix, null).position).toEqual(origin)
  })
})
describe('정밀 위치는 생성자의 capability에만 공개', () => {
  it('정밀 위치·이력은 소유자만 받고 키와 해시는 어떤 응답에도 포함하지 않는다', async () => {
    const key = 'ab'.repeat(32)
    const state = createField(
      crypto.randomUUID(),
      { color: 'yellow', size: 'small', dryness: 3 },
      SEED_REGIONS[0],
      origin,
      false,
      false,
      new Date(),
      12,
    )
    state.ownerHash = await hashOwnerKey(key)
    expect(await isOwner(state, key)).toBe(true)
    expect(await isOwner(state, 'cd'.repeat(32))).toBe(false)
    expect(await isOwner(state, undefined)).toBe(false)
    expect(await isOwner({ ...state, ownerHash: undefined }, key)).toBe(false)
    const legacy = publicSpecimen(
      { ...state, accuracyMeters: undefined },
      undefined,
      undefined,
      true,
    )
    expect(legacy.accuracyMeters).toBeUndefined() // A legacy grid size is not measured GPS accuracy.
    const shared = publicSpecimen(state, [born(state)])
    expect(shared.position).toBeNull()
    expect(shared.events![0].position).toBeNull()
    const own = publicSpecimen(state, [born(state)], undefined, true)
    expect(own.position).toEqual(origin)
    expect(own.accuracyMeters).toBe(12)
    expect(own.events![0].position).toEqual(origin)
    for (const response of [shared, own]) {
      expect(JSON.stringify(response)).not.toContain(key)
      expect(JSON.stringify(response)).not.toContain(state.ownerHash)
      expect(response).not.toHaveProperty('ownerHash')
    }
  })
})
