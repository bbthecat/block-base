import { describe, expect, it } from 'vitest'
import { createRoom, finish, joinRoom, RaceError, setStatus, viewRoom, type Store } from '../api/race'

function memory(): Store {
  const kv = new Map<string, string>()
  const h = new Map<string, Map<string, string>>()
  const hash = (k: string) => h.get(k) ?? h.set(k, new Map()).get(k)!
  return {
    setNx: async (k, v) => (kv.has(k) ? false : (kv.set(k, v), true)),
    get: async (k) => kv.get(k) ?? null,
    set: async (k, v) => void kv.set(k, v),
    hSetNx: async (k, f, v) => (hash(k).has(f) ? false : (hash(k).set(f, v), true)),
    hSet: async (k, f, v) => void hash(k).set(f, v),
    hGet: async (k, f) => hash(k).get(f) ?? null,
    hGetAll: async (k) => Object.fromEntries(hash(k)),
    hLen: async (k) => hash(k).size,
  }
}

const rejects = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toSatisfy((e) => e instanceof RaceError && e.status === status)

describe('ห้องแข่ง', () => {
  it('สร้าง → เข้า → เริ่ม → ส่ง → อันดับเรียงตามเวลา', async () => {
    const s = memory()
    const { code, hostKey } = await createRoom(s, 'fizzbuzz')
    expect(code).toMatch(/^[A-Z]{4}$/)
    await joinRoom(s, code.toLowerCase(), 'P01')
    await joinRoom(s, code, 'P02')
    await rejects(finish(s, code, 'P01'), 409) // ยังไม่เริ่ม
    await setStatus(s, code, hostKey, 'running')
    await finish(s, code, 'P02')
    const first = await finish(s, code, 'P02') // ส่งซ้ำได้เวลาเดิม
    const room = await viewRoom(s, code)
    expect(room.status).toBe('running')
    expect(room.players.map((p) => p.name)).toEqual(['P02', 'P01'])
    expect(room.players[0].doneMs).toBe(first.doneMs)
    expect(room.players[1].doneMs).toBeNull()
    expect(JSON.stringify(room)).not.toContain(hostKey)
  })

  it('คนอื่นเริ่มหรือจบห้องแทนผู้สร้างไม่ได้', async () => {
    const s = memory()
    const { code } = await createRoom(s, 'grade')
    await rejects(setStatus(s, code, 'เดา', 'running'), 403)
  })

  it('ตรวจรหัสห้องและชื่อ', async () => {
    const s = memory()
    await rejects(viewRoom(s, 'ABCD'), 404)
    await rejects(viewRoom(s, '12'), 400)
    const { code } = await createRoom(s, 'grade')
    await rejects(joinRoom(s, code, '   '), 400)
    await rejects(joinRoom(s, code, 'x'.repeat(21)), 400)
    await rejects(createRoom(s, '../etc'), 400)
  })

  it('เข้าห้องซ้ำด้วยชื่อเดิมไม่ล้างเวลาที่ทำได้', async () => {
    const s = memory()
    const { code, hostKey } = await createRoom(s, 'grade')
    await joinRoom(s, code, 'P01')
    await setStatus(s, code, hostKey, 'running')
    await finish(s, code, 'P01')
    await joinRoom(s, code, 'P01')
    expect((await viewRoom(s, code)).players[0].doneMs).not.toBeNull()
  })
})
