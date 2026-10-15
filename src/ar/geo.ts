import { Euler, Quaternion, Vector3 } from 'three'
import { bearing, distance, move } from '../../supabase/functions/_shared/field'
import type { Position } from '../lib/fieldApi'
export interface GPSFix {
  position: Position
  accuracy: number
  time: number
}
export interface Placement extends GPSFix {
  heading?: number
}
export interface Orientation {
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute?: boolean
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}
/** East = +X, north = -Z. Keeping this origin fixed is essential when the viewer moves. */
export function localPoint(origin: Position, p: Position) {
  const d = distance(origin, p),
    angle = (bearing(origin, p) * Math.PI) / 180
  return new Vector3(d * Math.sin(angle), 0, -d * Math.cos(angle))
}
/** W3C device orientation -> rear camera, including portrait/landscape screen rotation. */
export function cameraOrientation(e: Orientation, screenAngle = 0): Quaternion | null {
  const compass =
    Number.isFinite(e.webkitCompassHeading) &&
    (e.webkitCompassAccuracy ?? -1) >= 0 &&
    (e.webkitCompassAccuracy ?? 100) <= 50
  if (
    (!compass && !e.absolute) ||
    e.beta === null ||
    e.gamma === null ||
    (!compass && e.alpha === null)
  )
    return null
  const rad = Math.PI / 180,
    alpha = compass ? 360 - e.webkitCompassHeading! : e.alpha!
  if (![alpha, e.beta, e.gamma, screenAngle].every(Number.isFinite)) return null
  return new Quaternion()
    .setFromEuler(new Euler(e.beta * rad, alpha * rad, -e.gamma * rad, 'YXZ'))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -screenAngle * rad))
}
export function cameraHeading(q: Quaternion) {
  const v = new Vector3(0, 0, -1).applyQuaternion(q)
  return Math.hypot(v.x, v.z) < 0.1 ? null : ((Math.atan2(v.x, -v.z) * 180) / Math.PI + 360) % 360
}
export function throwPlacement(fix: GPSFix, heading: number | null): Placement {
  // Two metres is an explicit game distance, not a measured surface hit.
  return {
    ...fix,
    position: heading === null ? { ...fix.position } : move(fix.position, 2, heading),
    ...(heading === null ? {} : { heading }),
  }
}
