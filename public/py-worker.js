// รัน Python (Pyodide) แยกจากหน้าเว็บ เพื่อให้กด "หยุด" ได้แม้โค้ดวนไม่รู้จบ
/* global loadPyodide */
importScripts('./pyodide/pyodide.js')

let pyodide = null
let ctrl = null // Int32Array: [0] = มีข้อมูลรอ, [1] = ความยาว
let data = null // Uint8Array: ข้อความที่ผู้ใช้พิมพ์
let queue = [] // stdin ที่ป้อนไว้ล่วงหน้า (โหมดตรวจคำตอบ หรือเบราว์เซอร์ที่ไม่มี SharedArrayBuffer)
let interactive = false

const decoder = new TextDecoder()

async function init(sab) {
  pyodide = await loadPyodide({ indexURL: './pyodide/' })
  if (sab) {
    ctrl = new Int32Array(sab, 0, 2)
    data = new Uint8Array(sab, 8)
  }
  pyodide.setStdout({ write: (buf) => (postMessage({ type: 'stdout', text: decoder.decode(buf) }), buf.length) })
  pyodide.setStderr({ write: (buf) => (postMessage({ type: 'stderr', text: decoder.decode(buf) }), buf.length) })
  pyodide.setStdin({
    stdin: () => {
      if (queue.length) {
        const line = queue.shift()
        postMessage({ type: 'echo', text: line + '\n' })
        return line + '\n'
      }
      if (!interactive || !ctrl) return null // EOF
      postMessage({ type: 'input-request' })
      Atomics.store(ctrl, 0, 0)
      Atomics.wait(ctrl, 0, 0)
      const text = decoder.decode(data.slice(0, ctrl[1]))
      return text + '\n'
    },
  })
  // รายงานบรรทัดที่กำลังทำงาน ให้หน้าเว็บวาด "ขบวนรถ" วิ่งผ่านแต่ละสถานี
  // vars เป็น JSON {scope, vals}: ค่าตัวแปร "ก่อน" ทำบรรทัด n (n = 0 คือสถานะตอนจบ)
  pyodide.globals.set('__report', (n, vars) => postMessage({ type: 'line', n, vars }))
  postMessage({ type: 'ready', interactive: !!sab })
}

function parseError(err) {
  const tb = String(err.message || err)
  const lines = tb.trim().split('\n')
  // ตัดเฟรมภายในของ Pyodide ทิ้ง เหลือเฉพาะส่วนโค้ดของผู้เรียน
  const userStart = lines.findIndex((l) => l.includes('File "<main>"'))
  const shown = userStart >= 0 ? ['Traceback (most recent call last):', ...lines.slice(userStart)] : lines
  let line = null
  for (const l of shown) {
    const m = l.match(/File "<main>", line (\d+)/)
    if (m) line = Number(m[1])
  }
  const last = shown[shown.length - 1] || ''
  const m = last.match(/^(\w+(?:Error|Exception|Interrupt)?): ?(.*)$/)
  return { traceback: shown.join('\n'), type: m ? m[1] : 'Error', message: m ? m[2] : last, line }
}

// shortcut: รายงานได้สูงสุด 5000 บรรทัดต่อการรัน กันลูปไม่รู้จบท่วมหน้าเว็บ
const RUNNER = `
import sys, json, types
from __main__ import __report
__n = 0
def __snap(scope, ns):
    vals = {}
    for k, v in ns.items():
        if k.startswith('__') or callable(v) or isinstance(v, types.ModuleType):
            continue
        r = repr(v)
        vals[k] = r if len(r) <= 60 else r[:57] + '...'
    return json.dumps({'scope': scope, 'vals': vals}, ensure_ascii=False)
def __tr(frame, event, arg):
    global __n
    if frame.f_code.co_filename != '<main>':
        return None
    if event == 'line' and __n < 5000:
        __n += 1
        __report(frame.f_lineno, __snap(frame.f_code.co_name, frame.f_locals))
    return __tr
__g = {'__name__': '__main__'}
__c = compile(__code, '<main>', 'exec')
sys.settrace(__tr)
try:
    exec(__c, __g)
finally:
    sys.settrace(None)
    __report(0, __snap('<module>', __g))
`

onmessage = async (e) => {
  const msg = e.data
  if (msg.type === 'init') return init(msg.sab)
  if (msg.type === 'run') {
    queue = [...(msg.stdin || [])]
    interactive = !!msg.interactive
    const globals = pyodide.globals.get('dict')()
    globals.set('__code', msg.code)
    try {
      await pyodide.runPythonAsync(RUNNER, { globals })
      postMessage({ type: 'done' })
    } catch (err) {
      postMessage({ type: 'done', error: parseError(err) })
    } finally {
      globals.destroy()
    }
  }
}
