// โหมดแข่งแก้โจทย์: ผู้สอนสร้างห้อง ผู้เรียนเข้าด้วยรหัส 4 ตัว ใครตรวจคำตอบผ่านก่อนได้อันดับก่อน
import { useEffect, useRef, useState } from 'react'
import type { RoomView } from '../api/race'
import type { Lesson } from './lessons'

type Room = { code: string; role: 'host' | 'player'; name: string; hostKey?: string }

const KEY = 'saphan:race'
const loadRoom = (): Room | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}
const saveRoom = (r: Room | null) => {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r))
    else localStorage.removeItem(KEY)
  } catch {
    /* โหมดส่วนตัว: รีเฟรชแล้วต้องเข้าห้องใหม่ */
  }
}

async function api<T>(body?: object, code?: string): Promise<T> {
  const r = body
    ? await fetch('/api/race', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    : await fetch('/api/race?code=' + code)
  const j = await r.json().catch(() => ({ error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }))
  if (!r.ok) throw Object.assign(new Error(j.error ?? 'เกิดข้อผิดพลาด'), { status: r.status })
  return j as T
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** สถานะห้องแข่ง ดึงจาก server ทุก 2 วินาทีระหว่างอยู่ในห้อง */
export function useRace(opts: { enabled: boolean; passed: boolean; onStart(lessonId: string): void; log(e: string, data: Record<string, unknown>): void }) {
  const [room, setRoomState] = useState<Room | null>(loadRoom)
  const [view, setView] = useState<RoomView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const skew = useRef(0) // เวลา server − เวลาเครื่องนี้
  const started = useRef<string | null>(null)
  const sent = useRef(false)
  const cb = useRef(opts)
  cb.current = opts

  const setRoom = (r: Room | null) => {
    saveRoom(r)
    setRoomState(r)
    setView(null)
    started.current = null
    sent.current = false
  }

  // รอให้ตัวแปลงโค้ดพร้อมก่อน ไม่งั้นโจทย์ที่เปิดตอนเริ่มแข่งจะถูกบทเรียนล่าสุดทับ
  useEffect(() => {
    if (!room || !opts.enabled) return
    let alive = true
    const poll = async () => {
      try {
        const v = await api<RoomView>(undefined, room.code)
        if (!alive) return
        skew.current = v.now - Date.now()
        setView(v)
        setError('')
        if (v.status !== 'lobby' && started.current !== room.code) {
          started.current = room.code
          cb.current.onStart(v.lessonId)
        }
      } catch (e) {
        if (!alive) return
        if ((e as { status?: number }).status === 404) {
          setRoom(null)
          setError('ห้องนี้ไม่มีแล้ว')
        } else setError((e as Error).message)
      }
    }
    poll()
    const t = window.setInterval(poll, 2000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [room, opts.enabled])

  // ผ่านโจทย์ระหว่างแข่ง: ส่งเวลาไป server ครั้งเดียว
  useEffect(() => {
    if (!room || room.role !== 'player' || !opts.passed || view?.status !== 'running' || sent.current) return
    sent.current = true
    api<{ doneMs: number }>({ action: 'finish', code: room.code, name: room.name })
      .then((r) => cb.current.log('race-finish', { code: room.code, ms: r.doneMs }))
      .catch((e) => {
        sent.current = false
        setError((e as Error).message)
      })
  }, [opts.passed, room, view?.status])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return {
    room,
    view,
    error,
    busy,
    serverNow: () => Date.now() + skew.current,
    create: (lessonId: string, name: string) =>
      run(async () => {
        const r = await api<{ code: string; hostKey: string }>({ action: 'create', lessonId })
        setRoom({ code: r.code, role: 'host', name, hostKey: r.hostKey })
        cb.current.onStart(lessonId) // ผู้สอนเห็นโจทย์ได้ก่อนเริ่ม
        cb.current.log('race-create', { code: r.code, lesson: lessonId })
      }),
    join: (code: string, name: string) =>
      run(async () => {
        const r = await api<{ code: string; name: string }>({ action: 'join', code, name })
        setRoom({ code: r.code, role: 'player', name: r.name })
        cb.current.log('race-join', { code: r.code })
      }),
    setStatus: (action: 'start' | 'end') =>
      run(async () => {
        await api({ action, code: room!.code, hostKey: room!.hostKey })
      }),
    leave: () => setRoom(null),
  }
}

type Race = ReturnType<typeof useRace>

export function RacePanel({ race, lessons, defaultName }: { race: Race; lessons: Lesson[]; defaultName: string }) {
  const { room, view, error, busy } = race
  const [code, setCode] = useState('')
  const [name, setName] = useState(defaultName)
  const [lessonId, setLessonId] = useState(lessons[0]?.id ?? '')
  const [, tick] = useState(0)
  useEffect(() => {
    if (view?.status !== 'running') return
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [view?.status])

  if (!room)
    return (
      <div className="race lobby">
        <form
          className="race-box"
          onSubmit={(e) => {
            e.preventDefault()
            race.join(code, name)
          }}
        >
          <h2>เข้าห้องแข่ง</h2>
          <label>
            รหัสห้อง
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} placeholder="ABCD" autoComplete="off" className="code-input" />
          </label>
          <label>
            ชื่อที่จะแสดง
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="เช่น P01" autoComplete="off" />
          </label>
          <button className="btn primary small" disabled={busy || code.length !== 4 || !name.trim()}>
            เข้าห้อง
          </button>
        </form>
        <form
          className="race-box"
          onSubmit={(e) => {
            e.preventDefault()
            race.create(lessonId, name.trim() || 'ผู้สอน')
          }}
        >
          <h2>สร้างห้อง (ผู้สอน)</h2>
          <label>
            โจทย์ที่ใช้แข่ง
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <button className="btn outline small" disabled={busy || !lessonId}>
            สร้างห้อง
          </button>
        </form>
        {error && <p className="race-error" role="alert">{error}</p>}
      </div>
    )

  const status = view?.status ?? 'lobby'
  const elapsed = view?.startedAt ? race.serverNow() - view.startedAt : 0
  const me = view?.players.findIndex((p) => p.name === room.name) ?? -1
  const mine = me >= 0 ? view!.players[me] : null
  const lesson = lessons.find((l) => l.id === view?.lessonId)

  return (
    <div className="race">
      <div className="race-head">
        <span className="race-code" aria-label={`รหัสห้อง ${room.code}`}>
          {room.code}
        </span>
        <div className="race-state" aria-live="polite">
          <b>{lesson?.title ?? 'กำลังโหลด…'}</b>
          {status === 'lobby' && <span>{room.role === 'host' ? `รอผู้เรียนเข้าห้อง · ${view?.players.length ?? 0} คน` : 'รอผู้สอนกดเริ่ม…'}</span>}
          {status === 'running' && !mine?.doneMs && <span className="timer">{clock(elapsed)}</span>}
          {status === 'running' && mine?.doneMs != null && (
            <span>
              ผ่านแล้วใน {clock(mine.doneMs)} · อันดับ {me + 1}
            </span>
          )}
          {status === 'ended' && <span>จบการแข่งแล้ว</span>}
        </div>
        <span className="spacer" />
        {room.role === 'host' && status === 'lobby' && (
          <button className="btn primary small" disabled={busy || !view?.players.length} onClick={() => race.setStatus('start')}>
            เริ่มแข่ง
          </button>
        )}
        {room.role === 'host' && status === 'running' && (
          <button className="btn outline small" disabled={busy} onClick={() => race.setStatus('end')}>
            จบการแข่ง
          </button>
        )}
        <button className="btn text small" onClick={race.leave}>
          ออกจากห้อง
        </button>
      </div>
      {view && view.players.length > 0 && (
        <ol className="board">
          {view.players.map((p, i) => (
            <li key={p.name} className={(p.name === room.name ? 'me' : '') + (p.doneMs != null ? ' done' : '')}>
              <span className="rank">{p.doneMs != null ? i + 1 : '·'}</span>
              <span className="who">{p.name}</span>
              <span className="time">{p.doneMs != null ? clock(p.doneMs) : status === 'lobby' ? 'พร้อม' : 'กำลังทำ…'}</span>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="race-error" role="alert">{error}</p>}
    </div>
  )
}
