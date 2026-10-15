import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Parser from 'web-tree-sitter'
import { BlockEditor, type BlockEditorHandle } from './BlockEditor'
import { CodeView, emptyLineState, type LineState } from './CodeView'
import { stmtBodies, type Module, type Stmt } from './core/ast'
import { generate } from './core/generate'
import { initParser, parsePython, type Diagnostic } from './core/parse'
import { validate } from './core/validate'
import { explain } from './explain'
import { Icon } from './Icon'
import { LESSONS, STAGE_LABEL, type Lesson, type Stage } from './lessons'
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
  log.push({ t: new Date().toISOString(), e, ...data })
  store.set('log', JSON.stringify(log.slice(-LOG_MAX)))
}

function exportLog() {
  const blob = new Blob([store.get('log') ?? '[]'], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `saphan-log-${new Date().toISOString().slice(0, 10)}.json`
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
  const editTimer = useRef(0)
  const traceRef = useRef<number[]>([])
  const snapsRef = useRef<Vars[]>([]) // ค่าตัวแปรก่อนทำแต่ละก้าวใน traceRef
  const finalRef = useRef<Vars | null>(null)
  const replayTimer = useRef(0)
  const lastSide = useRef<'blocks' | 'code' | null>(null)
  const lessonId = useRef('')
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
    (l: Lesson) => {
      setLesson(l)
      lessonId.current = l.id
      lastSide.current = null
      store.set('last', l.id)
      track('open', { lesson: l.id })
      const src = store.get('code:' + l.id) ?? l.starter
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

  useEffect(() => {
    if (ready) store.set('code:' + lesson.id, code)
  }, [code, lesson.id, ready])

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
  const stages: Stage[] = ['use', 'modify', 'create']
  const next = LESSONS[LESSONS.indexOf(lesson) + 1]

  return (
    <div className="app" data-stage={lesson.stage}>
      <header className="top">
        <div className="brand">
          <span className="mark">
            <Icon name="route" />
          </span>
          <span>สะพาน Python</span>
        </div>
        <div className="divider" />
        <div className="crumb">
          <span className={'stage-pill ' + lesson.stage}>{STAGE_LABEL[lesson.stage].th}</span>
          <b>{lesson.title}</b>
          <span className="lesson-no">
            บทที่ {LESSONS.indexOf(lesson) + 1} / {LESSONS.length}
          </span>
        </div>
        <div className="spacer" />
        {hasTrace && !running && (
          <div className="tools">
            <button className="btn ghost" onClick={replay}>
              <Icon name="replay" /> ทวนเส้นทาง
            </button>
          </div>
        )}
        {running ? (
          <button className="btn primary stop" onClick={() => getRunner().stop()}>
            <Icon name="stop" /> หยุด
          </button>
        ) : (
          <button className="btn primary" onClick={run} disabled={!ready}>
            <Icon name="play" /> รัน
          </button>
        )}
      </header>

      <div className="main">
        <aside className="rail" aria-label="บทเรียน">
          <section className="card route-card">
          <h2 className="panel-title">เส้นทางบทเรียน</h2>
          <nav className="route">
            {stages.map((st) => (
              <div key={st} className={'segment ' + st}>
                <h3>
                  {STAGE_LABEL[st].th} · {STAGE_LABEL[st].en}
                </h3>
                {LESSONS.filter((l) => l.stage === st).map((l) => (
                  <button
                    key={l.id}
                    className={'stop' + (l.id === lesson.id ? ' current' : '') + (done.has(l.id) ? ' done' : '')}
                    onClick={() => openLesson(l)}
                    aria-current={l.id === lesson.id ? 'step' : undefined}
                  >
                    {l.title}
                    {done.has(l.id) && <span className="passed">ผ่าน</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <button className="btn text small export" onClick={exportLog}>
            ส่งออกบันทึกการเรียน (.json)
          </button>
          </section>

          <section className="card task">
            <h2>{lesson.title}</h2>
            <p className="goal">{lesson.goal}</p>
            <ol>
              {lesson.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
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
            <div className="task-actions">
              {lesson.tests && (
                <button className="btn outline" onClick={runCheck} disabled={checking || running}>
                  <Icon name="check" /> {checking ? 'กำลังตรวจ…' : 'ตรวจคำตอบ'}
                </button>
              )}
              {check?.ok && next && (
                <button className="btn primary small" onClick={() => openLesson(next)}>
                  บทถัดไป →
                </button>
              )}
              <button className="btn text" onClick={restart}>
                เริ่มใหม่
              </button>
            </div>
          </section>
        </aside>

        <section className="card blocks" aria-label="บล็อกคำสั่ง">
          <div className="panel-head">
            <h2 className="panel-title">บล็อก</h2>
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

        <section className="right">
          <div className="card code-panel" aria-label="โค้ด Python">
            <div className="panel-head">
              <h2 className="panel-title">Python</h2>
              <span className={'lint ' + (errors ? 'has-error' : diags.length ? 'has-warning' : 'clean')}>
                {errors ? `ต้องแก้ ${errors} จุด` : diags.length ? `ข้อสังเกต ${diags.length} จุด` : 'ไม่พบปัญหา'}
              </span>
            </div>
            <CodeView
              code={code}
              lines={lines}
              onEdit={onEdit}
              onCursorLine={onCursorLine}
              onFocus={() => setChanged(new Set())}
            />
            {diags.length > 0 && (
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

          <div className="console" aria-label="ผลลัพธ์">
            <div className="panel-head">
              <h2 className="panel-title">ผลลัพธ์</h2>
              {out.length > 0 && !running && (
                <button className="btn text small" onClick={() => setOut([])}>
                  ล้าง
                </button>
              )}
            </div>
            {vars && <VarStrip view={vars} />}
            <div className={'console-body' + (outdated ? ' outdated' : '')} aria-live="polite">
              {outdated && out.length > 0 && <p className="empty">ผลลัพธ์นี้มาจากโค้ดก่อนแก้ กดรันอีกครั้ง</p>}
              {out.length === 0 && !running && !runError && (
                <p className="empty">กด “รัน” แล้วผลลัพธ์ของโปรแกรมจะแสดงที่นี่</p>
              )}
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
          </div>
        </section>
      </div>
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
