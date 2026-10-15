/** Per-record random capability; its hash stays in the RLS-protected JSON state. Never in a URL. */
export function validOwnerKey(key: unknown): key is string {
  return typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)
}
export async function hashOwnerKey(key: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('')
}
export async function isOwner(state: { ownerHash?: string }, key: unknown) {
  return !!state.ownerHash && validOwnerKey(key) && state.ownerHash === (await hashOwnerKey(key))
}
