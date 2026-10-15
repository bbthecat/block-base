// ตัวกลางคุยกับ py-worker.js
export type RunError = { traceback: string; type: string; message: string; line: number | null }

/** ค่าตัวแปรในขอบเขตที่กำลังทำงาน (repr ของ Python) */
export type Vars = { scope: string; vals: Record<string, string> }

export type RunEvents = {
  onOutput(text: string, kind: 'stdout' | 'stderr' | 'echo'): void
  onInputRequest(): void
  /** line = 0 คือสถานะตอนโปรแกรมจบ */
  onLine?(line: number, vars: Vars): void
  onDone(error?: RunError): void
}

export class PythonRunner {
  private worker!: Worker
  private sab: SharedArrayBuffer | null = null
  private readyPromise!: Promise<void>
  private events: RunEvents | null = null
  interactive = false
  running = false

  constructor() {
    this.start()
  }

  private start() {
    this.sab = globalThis.crossOriginIsolated ? new SharedArrayBuffer(8 + 4096) : null
    this.worker = new Worker(import.meta.env.BASE_URL + 'py-worker.js')
    this.readyPromise = new Promise((resolve) => {
      this.worker.onmessage = (e) => {
        const m = e.data
        if (m.type === 'ready') {
          this.interactive = m.interactive
          resolve()
        } else if (m.type === 'stdout' || m.type === 'stderr' || m.type === 'echo') this.events?.onOutput(m.text, m.type)
        else if (m.type === 'line') this.events?.onLine?.(m.n, JSON.parse(m.vars))
        else if (m.type === 'input-request') this.events?.onInputRequest()
        else if (m.type === 'done') {
          this.running = false
          this.events?.onDone(m.error)
        }
      }
    })
    this.worker.postMessage({ type: 'init', sab: this.sab })
  }

  ready() {
    return this.readyPromise
  }

  async run(code: string, events: RunEvents, stdin: string[] = [], interactive = true) {
    await this.readyPromise
    this.events = events
    this.running = true
    this.worker.postMessage({ type: 'run', code, stdin, interactive })
  }

  /** ส่งข้อความที่ผู้ใช้พิมพ์ให้ input() ที่กำลังรออยู่ */
  sendInput(text: string) {
    if (!this.sab) return
    const ctrl = new Int32Array(this.sab, 0, 2)
    const bytes = new TextEncoder().encode(text).slice(0, 4096)
    new Uint8Array(this.sab, 8).set(bytes)
    ctrl[1] = bytes.length
    Atomics.store(ctrl, 0, 1)
    Atomics.notify(ctrl, 0)
  }

  /** หยุดโปรแกรมที่ค้าง: ปิด worker แล้วโหลดใหม่ */
  stop() {
    this.worker.terminate()
    this.running = false
    this.events?.onDone({ traceback: '', type: 'Stopped', message: 'หยุดโปรแกรมแล้ว', line: null })
    this.events = null
    this.start()
  }

  /** รันเงียบ ๆ แล้วคืนผลลัพธ์ทั้งหมด ใช้ตรวจคำตอบ */
  async capture(code: string, stdin: string[], timeoutMs = 5000): Promise<{ out: string; error?: RunError }> {
    let out = ''
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.stop()
        resolve({ out, error: { traceback: '', type: 'Timeout', message: 'โปรแกรมทำงานนานเกินไป', line: null } })
      }, timeoutMs)
      this.run(
        code,
        {
          onOutput: (t, k) => k === 'stdout' && (out += t),
          onInputRequest: () => {},
          onDone: (error) => {
            clearTimeout(timer)
            resolve({ out, error })
          },
        },
        stdin,
        false,
      )
    })
  }
}
