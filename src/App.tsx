import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Parser from 'web-tree-sitter'
import { BlockEditor, type BlockEditorHandle } from './BlockEditor'
import { CodeView, emptyLineState, type LineState } from './CodeView'
import { stmtBodies, type Module, type Stmt } from './core/ast'
import { describe } from './core/describe'
import { generate } from './core/generate'
import { initParser, parsePython, type Diagnostic } from './core/parse'
import { validate } from './core/validate'
import { explain } from './explain'
import { Icon } from './Icon'
import { LESSONS, STAGE_LABEL, type Lesson, type Stage } from './lessons'
import { RacePanel, useRace } from './Race'
import { PythonRunner, type RunError, type Vars } from './runner'

const BASE = import.meta.env.BASE_URL
let runnerSingleton: PythonRunner | null = null
const getRunner = () => (runnerSingleton ??= new PythonRunner())

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem('saphan:' + key)
    } catch {
      return null
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem('saphan:' + key, v)
    } catch {
      /* โหมดส่วนตัว: ไม่เก็บก็ไม่เป็นไร */
    }
  },
}

// บันทึกการเรียนสำหรับประเมินผลงานวิจัย: เก็บในเครื่องผู้เรียนเท่านั้น จนกว่าจะกดส่งออกเอง
const LOG_MAX = 5000
function track(e: string, data: Record<string, unknown> = {}) {
  let log: unknown[]
  try {
    log = JSON.parse(store.get('log') ?? '[]')
  } catch {
    log = []
  }
  log.push({ t: new Date().toISOString(), pid: store.get('pid'), e, ...data })
  store.set('log', JSON.stringify(log.slice(-LOG_MAX)))
}

function exportLog() {
  const blob = new Blob([store.get('log') ?? '[]'], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `saphan-log-${store.get('pid') || 'anon'}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function flatten(body: Stmt[], out: Stmt[] = []): Stmt[] {
  for (const s of body) {
    out.push(s)
    stmtBodies(s).forEach((b) => flatten(b, out))
  }
  return out
}

type LineMap = { lineToId: Map<number, string>; idToSpan: Map<string, [number, number]> }

/** จับคู่บรรทัดโค้ด ⇄ id บล็อก: spans มาจาก AST ต้นหนึ่ง ids จากอีกต้นที่โครงสร้างเหมือนกัน (เรียงแบบ pre-order) */
function buildMap(withSpans: Module, withIds: Module): LineMap {
  const a = flatten(withSpans.body)
  const b = flatten(withIds.body)
  const m: LineMap = { lineToId: new Map(), idToSpan: new Map() }
  a.forEach((s, i) => {
    const id = b[i]?.id
    if (!id || !s.span) return
    m.idToSpan.set(id, [s.span.startLine, s.span.endLine])
    // บล็อกลูกมาทีหลังใน pre-order จึงเขียนทับบรรทัดของตัวเองได้ถูกต้อง
    for (let n = s.span.startLine; n <= s.span.endLine; n++) m.lineToId.set(n, id)
  })
  return m
}

type Out = { text: string; kind: 'stdout' | 'stderr' | 'echo' }
type Check = { ok: boolean; got: string; passed: number; total: number; failed?: NonNullable<Lesson['tests']>[number] } | null
type VarView = { cur: Vars; prev: Vars | null } | null

export default function App() {
  const editor = useRef<BlockEditorHandle>(null)
  const parser = useRef<Parser | null>(null)
  const map = useRef<LineMap>({ lineToId: new Map(), idToSpan: new Map() })
  const mod = useRef<Module | null>(null) // AST ล่าสุดที่มี span ใช้หาคำสั่งของบรรทัดที่เลือก
  const editTimer = useRef(0)
  const traceRef = useRef<number[]>([])
  const snapsRef = useRef<Vars[]>([]) // ค่าตัวแปรก่อนทำแต่ละก้าวใน traceRef
  const finalRef = useRef<Vars | null>(null)
  const replayTimer = useRef(0)
  const lastSide = useRef<'blocks' | 'code' | null>(null)
  const lessonId = useRef('')
  const lastExercise = useRef<Lesson | null>(null)
  // นับเฉพาะตอนผู้เรียนสลับฝั่งที่แก้ ไม่ใช่ทุกการกดแป้น
  const noteSide = (side: 'blocks' | 'code') => {
    if (lastSide.current !== side) track('edit', { lesson: lessonId.current, side })
    lastSide.current = side
  }

  const [lesson, setLesson] = useState<Lesson>(LESSONS[0])
  const [code, setCode] = useState('')
  const [diags, setDiags] = useState<Diagnostic[]>([])
  const [stale, setStale] = useState(false)
  const staleRef = useRef(false) // fromBlocks ต้องรู้ค่าล่าสุด (useCallback ไม่มี deps)
  staleRef.current = stale
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState<Set<string>>(() => new Set(JSON.parse(store.get('done') ?? '[]')))

  const [out, setOut] = useState<Out[]>([])
  const [running, setRunning] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [runError, setRunError] = useState<RunError | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [visited, setVisited] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [changed, setChanged] = useState<Set<number>>(new Set())
  const [check, setCheck] = useState<Check>(null)
  const [checking, setChecking] = useState(false)
  const [hasTrace, setHasTrace] = useState(false)
  const [outdated, setOutdated] = useState(false) // ผลลัพธ์เป็นของโค้ดก่อนแก้
  const [vars, setVars] = useState<VarView>(null)
  const [tab, setTab] = useState<'out' | 'diags'>('out')
  const [pid, setPid] = useState(() => store.get('pid'))

  // ค่าตัวแปร "หลัง" ทำก้าวที่ i = ค่าก่อนก้าวถัดไป จึงเห็นผลของบรรทัดที่ขบวนจอดอยู่
  const varsAt = (i: number): VarView => {
    const s = snapsRef.current
    const cur = s[i + 1] ?? finalRef.current ?? s[i]
    return cur ? { cur, prev: s[i] ?? null } : null
  }

  const resetRunView = () => {
    window.clearInterval(replayTimer.current)
    setNow(null)
    setVisited(new Set())
    setRunError(null)
    setHasTrace(false)
    setVars(null)
  }

  // ---------------- โค้ด → AST → บล็อก ----------------
  const fromCode = useCallback((src: string) => {
    const p = parser.current
    if (!p) return
    const r = parsePython(p, src)
    setSelected(null)
    if (!r.module) {
      setDiags(r.diagnostics)
      setStale(true)
      return
    }
    editor.current!.load(r.module)
    mod.current = r.module
    map.current = buildMap(r.module, editor.current!.toAst())
    setDiags(validate(r.module).map((d) => ({ ...d, blockId: map.current.lineToId.get(d.line) })))
    setStale(false)
  }, [])

  // ---------------- บล็อก → AST → โค้ด ----------------
  const fromBlocks = useCallback(() => {
    if (staleRef.current) return // บล็อกค้างจากโค้ดเก่า ห้ามเขียนทับโค้ดที่ผู้เรียนพิมพ์
    noteSide('blocks')
    const ast = editor.current!.toAst()
    const next = generate(ast) // ใส่ span ลงใน ast ด้วย จึงจับคู่กับ ast ตัวเองได้เลย
    map.current = buildMap(ast, ast)
    mod.current = ast
    setOutdated(true)
    setCheck(null)
    resetRunView()
    setCode((prev) => {
      const old = new Set(prev.split('\n'))
      setChanged(new Set(next.split('\n').flatMap((l, i) => (l.trim() && !old.has(l) ? [i + 1] : []))))
      return next
    })
    setDiags(validate(ast))
    setStale(false)
  }, [])

  // ---------------- โหลดบทเรียน ----------------
  const openLesson = useCallback(
    (l: Lesson, fresh = false) => {
      setLesson(l)
      lessonId.current = l.id
      if (l.id !== 'sandbox') lastExercise.current = l
      lastSide.current = null
      store.set('last', l.id)
      track('open', { lesson: l.id })
      const src = (fresh ? null : store.get('code:' + l.id)) ?? l.starter
      setCode(src)
      setOut([])
      setCheck(null)
      setChanged(new Set())
      setSelected(null)
      resetRunView()
      fromCode(src)
    },
    [fromCode],
  )

  useEffect(() => {
    getRunner()
    initParser({ locateFile: (n) => BASE + n, language: BASE + 'tree-sitter-python.wasm' }).then((p) => {
      parser.current = p
      setReady(true)
      openLesson(LESSONS.find((l) => l.id === store.get('last')) ?? LESSONS[0])
    })
  }, [openLesson])

  // ระหว่างแข่งเริ่มจากโค้ดตั้งต้นเสมอ ไม่เขียนทับงานที่ฝึกไว้ในบทเดียวกัน
  const [raceOn, setRaceOn] = useState(() => {
    try {
      return !!localStorage.getItem('saphan:race')
    } catch {
      return false
    }
  })
  const race = useRace({
    enabled: ready,
    passed: raceOn && !!check?.ok,
    onStart: (id) => {
      const l = LESSONS.find((x) => x.id === id)
      if (l) openLesson(l, true)
    },
    log: track,
  })

  useEffect(() => {
    if (ready && !raceOn) store.set('code:' + lesson.id, code)
  }, [code, lesson.id, ready, raceOn])

  // ---------------- เลือกคู่บล็อก ⇄ บรรทัด ----------------
  const onSelectBlock = useCallback((id: string | null) => {
    if (!id) return setSelected(null)
    const owner = editor.current!.parentStatementIds(id).find((x) => map.current.idToSpan.has(x))
    setSelected(owner ? map.current.idToSpan.get(owner)! : null)
  }, [])

  const onCursorLine = useCallback(
    (line: number) => {
      const id = map.current.lineToId.get(line)
      if (!id || stale) return setSelected(null)
      editor.current!.select(id) // select() จากโค้ดไม่ส่ง event SELECTED กลับมา จึงตั้งช่วงบรรทัดเอง
      setSelected(map.current.idToSpan.get(id) ?? null)
    },
    [stale],
  )

  const onEdit = useCallback(
    (src: string) => {
      noteSide('code')
      setCode(src)
      setChanged(new Set())
      setOutdated(true)
      setCheck(null)
      resetRunView()
      window.clearTimeout(editTimer.current)
      editTimer.current = window.setTimeout(() => fromCode(src), 350)
    },
    [fromCode],
  )

  // ---------------- รันโปรแกรม ----------------
  const run = async () => {
    const runner = getRunner()
    resetRunView()
    setOut([])
    setTab('out') // ช่องพิมพ์ input() อยู่ในแท็บผลลัพธ์
    setChanged(new Set())
    traceRef.current = []
    snapsRef.current = []
    finalRef.current = null
    setOutdated(false)
    setRunning(true)
    const seen = new Set<number>()
    let frame = 0
    const flush = () => {
      frame = 0
      setNow(traceRef.current[traceRef.current.length - 1] ?? null)
      setVisited(new Set(seen))
      setVars(varsAt(traceRef.current.length - 1))
    }
    await runner.ready()
    // shortcut: โฮสต์ที่ไม่ส่ง COOP/COEP (เช่น GitHub Pages) รับ input ล่วงหน้าผ่าน prompt แทน; อัปเกรดด้วย coi-serviceworker
    const stdin =
      !runner.interactive && /\binput\s*\(/.test(code)
        ? (window.prompt('ป้อนข้อมูลสำหรับ input() คั่นแต่ละบรรทัดด้วย |') ?? '').split('|')
        : []
    runner.run(
      code,
      {
        onOutput: (text, kind) => setOut((o) => [...o, { text, kind }]),
        onInputRequest: () => setWaiting(true),
        onLine: (n, v) => {
          if (n === 0) return void (finalRef.current = v)
          snapsRef.current.push(v)
          traceRef.current.push(n)
          seen.add(n)
          frame ||= requestAnimationFrame(flush)
        },
        onDone: (error) => {
          cancelAnimationFrame(frame)
          setVisited(new Set(seen))
          setNow(null)
          setRunning(false)
          setWaiting(false)
          setHasTrace(traceRef.current.length > 0)
          setVars(varsAt(traceRef.current.length - 1))
          if (error) setRunError(error)
          track('run', { lesson: lessonId.current, error: error?.type ?? null, line: error?.line ?? null })
        },
      },
      stdin,
      runner.interactive,
    )
  }

  const sendInput = (text: string) => {
    setOut((o) => [...o, { text: text + '\n', kind: 'echo' }])
    setWaiting(false)
    getRunner().sendInput(text)
  }

  // ทวนเส้นทาง: ขบวนรถวิ่งผ่านสถานีตามลำดับที่โปรแกรมทำงานจริง
  const replay = () => {
    const steps = traceRef.current.slice(0, 300)
    const seen = new Set<number>()
    let i = 0
    window.clearInterval(replayTimer.current)
    setRunError(null)
    replayTimer.current = window.setInterval(() => {
      if (i >= steps.length) {
        window.clearInterval(replayTimer.current)
        setNow(null)
        return
      }
      seen.add(steps[i])
      setVisited(new Set(seen))
      setVars(varsAt(i))
      setNow(steps[i++])
    }, 260)
  }

  useEffect(() => {
    editor.current?.highlight(now !== null ? (map.current.lineToId.get(now) ?? null) : null)
  }, [now])

  // ---------------- ตรวจคำตอบ ----------------
  const runCheck = async () => {
    if (!lesson.tests) return
    setChecking(true)
    const total = lesson.tests.length
    let result: NonNullable<Check> = { ok: true, got: '', passed: 0, total }
    for (const t of lesson.tests) {
      const r = await getRunner().capture(t.extra ? code + '\n' + t.extra + '\n' : code, t.stdin)
      const got = r.error ? `${r.error.type}: ${r.error.message}` : r.out.trimEnd()
      if (r.error || !got.endsWith(t.expected)) {
        result = { ok: false, got, passed: result.passed, total, failed: t }
        break
      }
      result.passed++
    }
    setChecking(false)
    const ok = result.ok
    setCheck(result)
    track('check', { lesson: lesson.id, ok, passed: result.passed, total })
    if (ok) {
      const next = new Set(done).add(lesson.id)
      setDone(next)
      store.set('done', JSON.stringify([...next]))
    }
  }

  const restart = () => {
    if (!window.confirm('ล้างงานในบทนี้ แล้วเริ่มจากโค้ดตั้งต้นใหม่?')) return
    store.set('code:' + lesson.id, lesson.starter)
    openLesson(lesson)
  }

  // error/คำเตือนไปถึงบล็อกที่เกี่ยวข้องด้วย
  useEffect(() => {
    if (stale) return
    const marks = new Map<string, { severity: 'error' | 'warning'; text: string }>()
    for (const d of diags) if (d.blockId && marks.get(d.blockId)?.severity !== 'error') marks.set(d.blockId, { severity: d.severity, text: d.message })
    const failed = runError?.line ? map.current.lineToId.get(runError.line) : undefined
    if (failed) marks.set(failed, { severity: 'error', text: explain(runError!) })
    editor.current?.mark(marks)
  }, [diags, runError, stale])

  useEffect(() => {
    document.querySelector('.verdict')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [check])

  const lines: LineState = useMemo(() => {
    const s = emptyLineState()
    s.now = now
    s.visited = visited
    s.stopped = runError?.line ?? null
    s.selected = selected
    s.changed = changed
    for (const d of diags) if (s.diags.get(d.line) !== 'error') s.diags.set(d.line, d.severity)
    return s
  }, [now, visited, runError, selected, changed, diags])

  const errors = diags.filter((d) => d.severity === 'error').length
  const picked = selected && mod.current ? flatten(mod.current.body).find((s) => s.span?.startLine === selected[0]) : undefined
  const sandbox = LESSONS.find((l) => l.id === 'sandbox')!
  const exercises = LESSONS.filter((l) => l !== sandbox)
  const inSandbox = lesson === sandbox && !raceOn
  const raceLocked = raceOn && (!race.room || (race.room.role === 'player' && (race.view?.status ?? 'lobby') === 'lobby'))
  const idx = exercises.indexOf(lesson)
  const prev = exercises[idx - 1]
  const next = exercises[idx + 1]
  const stages: Stage[] = ['use', 'modify', 'create']

  return (
    <div className="app" data-stage={lesson.stage}>
      {pid === null && (
        <ParticipantForm
          onDone={(v) => {
            store.set('pid', v)
            setPid(v)
            track('start', { pid: v })
          }}
        />
      )}
      <header className="top">
        <div className="brand">สมุดฝึก Python</div>
        <nav className="modes" aria-label="โหมด">
          <button
            className={'mode' + (!inSandbox && !raceOn ? ' on' : '')}
            aria-pressed={!inSandbox && !raceOn}
            onClick={() => {
              setRaceOn(false)
              openLesson(lastExercise.current ?? exercises[0])
            }}
          >
            แบบฝึกหัด
          </button>
          <button
            className={'mode' + (inSandbox ? ' on' : '')}
            aria-pressed={inSandbox}
            onClick={() => {
              setRaceOn(false)
              openLesson(sandbox)
            }}
          >
            หน้าว่าง
          </button>
          <button className={'mode' + (raceOn ? ' on' : '')} aria-pressed={raceOn} onClick={() => setRaceOn(true)}>
            แข่งกัน
          </button>
        </nav>
        {!inSandbox && !raceOn && (
          <>
            <div className="picker">
              <button className="step-btn" aria-label="บทก่อนหน้า" disabled={!prev} onClick={() => prev && openLesson(prev)}>
                ‹
              </button>
              <span className={'stage-chip ' + lesson.stage}>{STAGE_LABEL[lesson.stage].th}</span>
              <label className="sr-only" htmlFor="lesson-pick">
                เลือกบทเรียน
              </label>
              <select id="lesson-pick" value={lesson.id} onChange={(e) => openLesson(exercises.find((l) => l.id === e.target.value)!)}>
                {stages.map((st) => (
                  <optgroup key={st} label={`${STAGE_LABEL[st].th} · ${STAGE_LABEL[st].en}`}>
                    {exercises.map((l, i) =>
                      l.stage === st ? (
                        <option key={l.id} value={l.id}>
                          บท {i + 1} · {l.title}
                          {done.has(l.id) ? ' ✓' : ''}
                        </option>
                      ) : null,
                    )}
                  </optgroup>
                ))}
              </select>
              <button className="step-btn" aria-label="บทถัดไป" disabled={!next} onClick={() => next && openLesson(next)}>
                ›
              </button>
            </div>
            <span className="dots" aria-label={`ทำผ่าน ${exercises.filter((l) => done.has(l.id)).length} จาก ${exercises.length} บท`}>
              {exercises.map((l) => (
                <i key={l.id} className={(done.has(l.id) ? 'done' : '') + (l === lesson ? ' current' : '')} />
              ))}
            </span>
          </>
        )}
        <div className="spacer" />
        <button className="btn export" onClick={exportLog}>
          ส่งออกบันทึก (.json)
        </button>
        {running ? (
          <button className="btn primary run stop" onClick={() => getRunner().stop()}>
            <Icon name="stop" /> หยุด
          </button>
        ) : (
          <button className="btn primary run" onClick={run} disabled={!ready}>
            <Icon name="play" /> รัน
          </button>
        )}
      </header>

      <section className="task" aria-label="โจทย์">
        {raceOn && <RacePanel race={race} lessons={exercises.filter((l) => l.tests)} defaultName={pid ?? ''} />}
        {!raceLocked && (
          <>
        <div className="titles">
          <h1>{lesson.title}</h1>
          <p className="goal">{lesson.goal}</p>
        </div>
        <ol className="steps">
          {lesson.steps.map((s, i) => (
            <li key={s}>
              <span className="n">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="task-actions">
          {lesson.tests && (
            <button className="btn outline small" onClick={runCheck} disabled={checking || running}>
              <Icon name="check" /> {checking ? 'กำลังตรวจ…' : 'ตรวจคำตอบ'}
            </button>
          )}
          {check?.ok && next && !raceOn && (
            <button className="btn primary small" onClick={() => openLesson(next)}>
              บทถัดไป →
            </button>
          )}
        </div>
        {check && (
          <div className={'verdict ' + (check.ok ? 'pass' : 'fail')} role="status">
            {check.ok ? (
              <b>
                ถึงปลายทางแล้ว ผลลัพธ์ตรงตามโจทย์{check.total > 1 && ` ครบ ${check.total} กรณี`}
              </b>
            ) : (
              <>
                <b>
                  ยังไม่ตรงโจทย์
                  {check.total > 1 && ` · ผ่าน ${check.passed} จาก ${check.total} กรณี`}
                </b>
                {check.failed!.stdin.length > 0 && (
                  <>
                    <span>เมื่อป้อน</span>
                    <pre>{check.failed!.stdin.join('\n')}</pre>
                  </>
                )}
                {check.failed!.extra && (
                  <>
                    <span>เมื่อเรียก</span>
                    <pre>{check.failed!.extra}</pre>
                  </>
                )}
                <span>ได้</span>
                <pre>{check.got || '(ไม่มีผลลัพธ์)'}</pre>
                <span>ควรได้</span>
                <pre>{check.failed!.expected}</pre>
              </>
            )}
          </div>
        )}
          </>
        )}
      </section>

      <div className="main">
        {raceLocked && (
          <div className="race-lock" role="status">
            <p>{race.room ? 'โจทย์จะเปิดเมื่อผู้สอนกดเริ่มแข่ง' : 'เข้าห้องหรือสร้างห้องด้านบนก่อนนะ'}</p>
          </div>
        )}
        <section className="card blocks" aria-label="บล็อกคำสั่ง">
          <div className="panel-head">
            <h2 className="panel-title">บล็อก</h2>
            <span className="hint">ลากจากกล่องซ้ายมาวาง</span>
            <button className="btn text small" onClick={restart}>
              {inSandbox ? 'ล้างหน้านี้' : 'เริ่มบทนี้ใหม่'}
            </button>
          </div>
          <BlockEditor ref={editor} onChange={fromBlocks} onSelect={onSelectBlock} />
          {stale && (
            <div className="stale-lock" role="status">
              <p>
                แก้โค้ดบรรทัด {diags[0]?.line ?? '?'} ก่อน
                <br />
                แล้วบล็อกจะตามมา
              </p>
            </div>
          )}
        </section>

        <section className="right" aria-label="โค้ดและผลลัพธ์">
          <div className="card code-panel" aria-label="โค้ด Python">
            <div className="panel-head">
              <h2 className="panel-title">โค้ด Python</h2>
              <button className={'lint ' + (errors ? 'has-error' : diags.length ? 'has-warning' : 'clean')} onClick={() => diags.length && setTab('diags')}>
                {errors ? `ต้องแก้ ${errors} จุด` : diags.length ? `ข้อสังเกต ${diags.length} จุด` : 'ไม่พบปัญหา'}
              </button>
            </div>
            <CodeView
              code={code}
              lines={lines}
              onEdit={onEdit}
              onCursorLine={onCursorLine}
              onFocus={() => setChanged(new Set())}
            />
            {picked && (
              <p className="explain" aria-live="polite">
                <b>บรรทัด {selected![0]}</b>
                {describe(picked)}
              </p>
            )}
          </div>

          <div className="console" aria-label="ผลการรัน">
            <div className="panel-head" role="tablist">
              <button role="tab" className="tab" aria-selected={tab === 'out'} onClick={() => setTab('out')}>
                ผลลัพธ์
              </button>
              <button role="tab" className="tab" aria-selected={tab === 'diags'} onClick={() => setTab('diags')}>
                ปัญหา <span className={'count' + (errors ? ' bad' : '')}>{diags.length}</span>
              </button>
              <span className="spacer" />
              {hasTrace && !running && (
                <button className="btn text small" onClick={replay}>
                  <Icon name="replay" /> ทวนทีละบรรทัด
                </button>
              )}
              {out.length > 0 && !running && tab === 'out' && (
                <button className="btn text small" onClick={() => setOut([])}>
                  ล้าง
                </button>
              )}
            </div>
            {tab === 'diags' ? (
              <div className="console-body">
                {diags.length === 0 ? (
                  <p className="empty">ไม่พบปัญหาในโค้ด</p>
                ) : (
                  <ul className="diags">
                    {diags.map((d, i) => (
                      <li key={i} className={d.severity}>
                        <button onClick={() => (d.blockId ? editor.current!.select(d.blockId) : onCursorLine(d.line))}>
                          <span className="at">บรรทัด {d.line}</span>
                          {d.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                {vars && <VarStrip view={vars} />}
                <div className={'console-body' + (outdated ? ' outdated' : '')} aria-live="polite">
                  {outdated && out.length > 0 && <p className="empty">ผลลัพธ์นี้มาจากโค้ดก่อนแก้ กดรันอีกครั้ง</p>}
                  {out.length === 0 && !running && !runError && <p className="empty">กด “รัน” แล้วผลลัพธ์ของโปรแกรมจะแสดงที่นี่</p>}
                  <pre>
                    {out.map((o, i) => (
                      <span key={i} className={o.kind}>
                        {o.text}
                      </span>
                    ))}
                  </pre>
                  {waiting && <InputLine onSubmit={sendInput} />}
                  {runError && (
                    <div className={'run-error' + (runError.type === 'Stopped' ? ' neutral' : '')}>
                      <p className="what">
                        {runError.line && <span className="at">หยุดที่บรรทัด {runError.line}</span>}
                        {explain(runError)}
                      </p>
                      {runError.traceback && (
                        <details>
                          <summary>ข้อความจาก Python</summary>
                          <pre>{runError.traceback}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// รหัสผู้เข้าร่วมใช้จับคู่บันทึกการเรียนกับแบบทดสอบ/แบบสอบถาม ไม่เก็บชื่อจริง
function ParticipantForm({ onDone }: { onDone(pid: string): void }) {
  const [v, setV] = useState('')
  return (
    <div className="pid-overlay">
      <form
        className="pid-card"
        onSubmit={(e) => {
          e.preventDefault()
          onDone(v.trim())
        }}
      >
        <h2>ยินดีต้อนรับสู่สมุดฝึก Python</h2>
        <label htmlFor="pid">รหัสผู้เข้าร่วม (ได้รับจากผู้วิจัย)</label>
        <input id="pid" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="เช่น P01" autoComplete="off" />
        <p>ระบบบันทึกการใช้งานไว้ในเครื่องนี้เท่านั้น จะส่งให้ผู้วิจัยเมื่อคุณกด “ส่งออกบันทึก” เอง</p>
        <div className="pid-actions">
          <button className="btn primary" type="submit" disabled={!v.trim()}>
            เริ่มใช้งาน
          </button>
          <button className="btn text" type="button" onClick={() => onDone('')}>
            ไม่ได้เข้าร่วมการวิจัย
          </button>
        </div>
      </form>
    </div>
  )
}

function VarStrip({ view: { cur, prev } }: { view: NonNullable<VarView> }) {
  const entries = Object.entries(cur.vals)
  const sameScope = prev?.scope === cur.scope
  return (
    <div className="vars" aria-label="ค่าตัวแปร">
      <span className="scope">{cur.scope === '<module>' ? 'ตัวแปร' : `ใน ${cur.scope}()`}</span>
      {entries.length === 0 && <span className="none">ยังไม่มี</span>}
      {entries.map(([k, v]) => (
        <span key={k} className={'var' + (sameScope && prev!.vals[k] !== v ? ' fresh' : '')}>
          <b>{k}</b> = <code>{v}</code>
        </span>
      ))}
    </div>
  )
}

function InputLine({ onSubmit }: { onSubmit(text: string): void }) {
  const [v, setV] = useState('')
  return (
    <form
      className="input-line"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(v)
      }}
    >
      <label htmlFor="stdin">โปรแกรมรอให้พิมพ์</label>
      <input id="stdin" autoFocus value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
      <button className="btn primary small" type="submit">
        ส่ง
      </button>
    </form>
  )
}
