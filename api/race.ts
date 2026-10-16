// ห้องแข่งแก้โจทย์: Vercel Function + Upstash Redis (REST)
// ข้อมูลห้องหมดอายุเองใน 3 ชั่วโมง ไม่เก็บชื่อจริง ใช้ชื่อเล่น/รหัสผู้เข้าร่วมที่ผู้เรียนพิมพ์เอง

// ไม่ต้องลง @types/node ทั้งชุดเพื่อใช้แค่ตัวแปรสภาพแวดล้อม
declare const process: { env: Record<string, string | undefined> }

const TTL = 3 * 60 * 60
const MAX_PLAYERS = 60

export type Status = 'lobby' | 'running' | 'ended'
type Meta = { lessonId: string; hostKey: string; status: Status; startedAt: number | null }
type Player = { joinedAt: number; doneMs: number | null }
export type RoomView = {
  code: string
  lessonId: string
  status: Status
  startedAt: number | null
  now: number // เวลาของ server ให้ฝั่งผู้เรียนชดเชยนาฬิกาเครื่องที่เดินไม่ตรง
  players: { name: string; doneMs: number | null }[]
}

export interface Store {
  setNx(key: string, value: string): Promise<boolean>
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  hSetNx(key: string, field: string, value: string): Promise<boolean>
  hSet(key: string, field: string, value: string): Promise<void>
  hGet(key: string, field: string): Promise<string | null>
  hGetAll(key: string): Promise<Record<string, string>>
  hLen(key: string): Promise<number>
}

export class RaceError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const metaKey = (code: string) => `race:${code}:meta`
const playersKey = (code: string) => `race:${code}:players`
// ตัดตัวที่สับสนง่ายออก (I, O) ให้อ่านรหัสจากจอโปรเจกเตอร์ได้
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

function checkCode(code: unknown): string {
  if (typeof code !== 'string' || !/^[A-Z]{4}$/.test(code.toUpperCase())) throw new RaceError(400, 'รหัสห้องต้องเป็นตัวอักษร 4 ตัว')
  return code.toUpperCase()
}
function checkName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n || n.length > 20 || /\p{Cc}/u.test(n)) throw new RaceError(400, 'ชื่อต้องยาว 1–20 ตัวอักษร')
  return n
}
async function loadMeta(store: Store, code: string): Promise<Meta> {
  const raw = await store.get(metaKey(code))
  if (!raw) throw new RaceError(404, 'ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว')
  return JSON.parse(raw) as Meta
}
async function hostMeta(store: Store, code: string, hostKey: unknown): Promise<Meta> {
  const meta = await loadMeta(store, code)
  if (hostKey !== meta.hostKey) throw new RaceError(403, 'เฉพาะผู้สร้างห้องเท่านั้น')
  return meta
}

export async function createRoom(store: Store, lessonId: unknown, random = Math.random) {
  if (typeof lessonId !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(lessonId)) throw new RaceError(400, 'บทเรียนไม่ถูกต้อง')
  const hostKey = crypto.randomUUID()
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(random() * LETTERS.length)]).join('')
    const meta: Meta = { lessonId, hostKey, status: 'lobby', startedAt: null }
    if (await store.setNx(metaKey(code), JSON.stringify(meta))) return { code, hostKey }
  }
  throw new RaceError(503, 'สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง')
}

export async function joinRoom(store: Store, codeIn: unknown, nameIn: unknown) {
  const code = checkCode(codeIn)
  const name = checkName(nameIn)
  await loadMeta(store, code)
  // ชื่อซ้ำ = คนเดิมกลับเข้ามา (เช่นรีเฟรชหน้า) ไม่ล้างเวลาที่ทำได้
  if (await store.hGet(playersKey(code), name)) return { code, name }
  if ((await store.hLen(playersKey(code))) >= MAX_PLAYERS) throw new RaceError(409, 'ห้องเต็มแล้ว')
  await store.hSetNx(playersKey(code), name, JSON.stringify({ joinedAt: Date.now(), doneMs: null } satisfies Player))
  return { code, name }
}

export async function setStatus(store: Store, codeIn: unknown, hostKey: unknown, status: 'running' | 'ended') {
  const code = checkCode(codeIn)
  const meta = await hostMeta(store, code, hostKey)
  if (status === 'running') {
    if (meta.status !== 'lobby') throw new RaceError(409, 'ห้องนี้เริ่มแข่งไปแล้ว')
    meta.startedAt = Date.now()
  }
  meta.status = status
  await store.set(metaKey(code), JSON.stringify(meta))
}

export async function finish(store: Store, codeIn: unknown, nameIn: unknown) {
  const code = checkCode(codeIn)
  const name = checkName(nameIn)
  const meta = await loadMeta(store, code)
  if (meta.status !== 'running' || meta.startedAt === null) throw new RaceError(409, 'การแข่งยังไม่เริ่มหรือจบไปแล้ว')
  const raw = await store.hGet(playersKey(code), name)
  if (!raw) throw new RaceError(404, 'ยังไม่ได้เข้าห้องนี้')
  const p = JSON.parse(raw) as Player
  // ส่งซ้ำได้ ใช้เวลาครั้งแรกที่ผ่าน
  if (p.doneMs === null) {
    p.doneMs = Date.now() - meta.startedAt
    await store.hSet(playersKey(code), name, JSON.stringify(p))
  }
  return { doneMs: p.doneMs }
}

export async function viewRoom(store: Store, codeIn: unknown): Promise<RoomView> {
  const code = checkCode(codeIn)
  const meta = await loadMeta(store, code)
  const all = await store.hGetAll(playersKey(code))
  const players = Object.entries(all)
    .map(([name, raw]) => ({ name, ...(JSON.parse(raw) as Player) }))
    .sort((a, b) => (a.doneMs ?? Infinity) - (b.doneMs ?? Infinity) || a.joinedAt - b.joinedAt)
    .map(({ name, doneMs }) => ({ name, doneMs }))
  return { code, lessonId: meta.lessonId, status: meta.status, startedAt: meta.startedAt, now: Date.now(), players }
}

// ---------------- Upstash Redis ผ่าน REST ----------------

function upstash(): Store {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new RaceError(503, 'ยังไม่ได้ตั้งค่าฐานข้อมูลของโหมดแข่ง')
  const cmd = async (...args: (string | number)[]) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(args) })
    const j = (await r.json()) as { result?: unknown; error?: string }
    if (j.error) throw new Error(j.error)
    return j.result
  }
  return {
    setNx: async (k, v) => (await cmd('SET', k, v, 'NX', 'EX', TTL)) === 'OK',
    get: async (k) => (await cmd('GET', k)) as string | null,
    set: async (k, v) => void (await cmd('SET', k, v, 'EX', TTL)),
    hSetNx: async (k, f, v) => {
      const added = (await cmd('HSETNX', k, f, v)) === 1
      await cmd('EXPIRE', k, TTL)
      return added
    },
    hSet: async (k, f, v) => void (await cmd('HSET', k, f, v)),
    hGet: async (k, f) => (await cmd('HGET', k, f)) as string | null,
    hGetAll: async (k) => {
      const flat = ((await cmd('HGETALL', k)) as string[] | null) ?? []
      const out: Record<string, string> = {}
      for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1]
      return out
    },
    hLen: async (k) => (await cmd('HLEN', k)) as number,
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn())
  } catch (e) {
    if (e instanceof RaceError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง' }, 500)
  }
}

export function GET(req: Request) {
  return handle(() => viewRoom(upstash(), new URL(req.url).searchParams.get('code')))
}

export function POST(req: Request) {
  return handle(async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const store = upstash()
    switch (b.action) {
      case 'create':
        return createRoom(store, b.lessonId)
      case 'join':
        return joinRoom(store, b.code, b.name)
      case 'start':
        return setStatus(store, b.code, b.hostKey, 'running')
      case 'end':
        return setStatus(store, b.code, b.hostKey, 'ended')
      case 'finish':
        return finish(store, b.code, b.name)
      default:
        throw new RaceError(400, 'คำสั่งไม่ถูกต้อง')
    }
  })
}
