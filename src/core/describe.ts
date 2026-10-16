// อธิบายคำสั่งหนึ่งบรรทัดเป็นภาษาไทยจาก AST ให้ผู้เรียนเห็นว่าบล็อก/บรรทัดที่เลือกทำอะไร
import type { Expr, Stmt } from './ast'
import { genExpr } from './generate'

const code = (e: Expr) => `“${genExpr(e)}”`

/** ค่าที่มักเจอ อธิบายเป็นคำ ส่วนอื่นยกโค้ดมาให้ดู */
function value(e: Expr): string {
  if (e.kind === 'Call' && e.func === 'input') return 'ข้อความที่ผู้ใช้พิมพ์'
  if (e.kind === 'Call' && (e.func === 'int' || e.func === 'float') && e.args[0]?.kind === 'Call' && e.args[0].func === 'input')
    return 'ตัวเลขที่ผู้ใช้พิมพ์'
  if (e.kind === 'Str') return `ข้อความ ${code(e)}`
  if (e.kind === 'Num') return `ตัวเลข ${e.value}`
  if (e.kind === 'List') return e.items.length ? `ลิสต์ ${code(e)}` : 'ลิสต์ว่าง'
  if (e.kind === 'Dict') return e.keys.length ? `ดิกชันนารี ${code(e)}` : 'ดิกชันนารีว่าง'
  return code(e)
}

const int = (e: Expr | undefined) => (e?.kind === 'Num' && /^-?\d+$/.test(e.value) ? Number(e.value) : null)

function loop(s: Extract<Stmt, { kind: 'For' }>): string {
  const it = s.iter
  if (it.kind === 'Call' && it.func === 'range' && it.args.length >= 1 && it.args.length <= 2) {
    const [a, b] = it.args.length === 1 ? [null, it.args[0]] : it.args
    const start = a ? int(a) : 0
    const stop = int(b)
    if (start !== null && stop !== null)
      return stop > start
        ? `ทำคำสั่งข้างในซ้ำ ${stop - start} รอบ โดย ${s.target} มีค่าตั้งแต่ ${start} ถึง ${stop - 1}`
        : `ไม่ทำคำสั่งข้างในเลย เพราะ range(${start}, ${stop}) ไม่มีตัวเลข`
    return `ทำคำสั่งข้างในซ้ำ โดย ${s.target} มีค่าตั้งแต่ ${a ? code(a) : '0'} จนถึงก่อน ${code(b)}`
  }
  return `ทำคำสั่งข้างในซ้ำกับสมาชิกแต่ละตัวใน ${code(it)} โดยเก็บไว้ในตัวแปร ${s.target}`
}

export function describe(s: Stmt): string {
  switch (s.kind) {
    case 'Assign':
      return `เก็บ${value(s.value)}ไว้ในตัวแปร ${s.target}`
    case 'AugAssign':
      return s.op === '+'
        ? `เพิ่มค่าตัวแปร ${s.target} ขึ้นอีก ${code(s.value)}`
        : s.op === '-'
          ? `ลดค่าตัวแปร ${s.target} ลง ${code(s.value)}`
          : `เปลี่ยนค่า ${s.target} เป็น ${s.target} ${s.op} ${genExpr(s.value)}`
    case 'SubscriptAssign':
      return `เปลี่ยนค่าใน ${genExpr(s.target)} ตำแหน่ง ${code(s.index)} ให้เป็น${value(s.value)}`
    case 'ExprStmt': {
      const e = s.expr
      if (e.kind === 'Call' && e.func === 'print')
        return e.args.length ? `แสดง ${e.args.map(value).join(' และ ')} ออกทางหน้าจอ` : 'แสดงบรรทัดว่างออกทางหน้าจอ'
      if (e.kind === 'MethodCall' && e.method === 'append') return `เพิ่ม ${code(e.args[0] ?? e)} ต่อท้ายลิสต์ ${genExpr(e.obj)}`
      return `เรียกใช้ ${code(e)}`
    }
    case 'If': {
      const rest = s.branches.length > 1 ? ' ถ้าไม่จริงไปตรวจเงื่อนไข elif ถัดไป' : ''
      const els = s.orelse ? (rest ? ' ถ้าไม่จริงสักข้อทำส่วน else' : ' ถ้าไม่จริงทำส่วน else') : ''
      return `ตรวจว่า ${code(s.branches[0].test)} จริงไหม ถ้าจริงทำคำสั่งข้างใน${rest}${els}`
    }
    case 'While':
      return `ทำคำสั่งข้างในซ้ำ ตราบใดที่ ${code(s.test)} ยังเป็นจริง`
    case 'For':
      return loop(s)
    case 'FunctionDef':
      return s.params.length
        ? `สร้างฟังก์ชันชื่อ ${s.name} ที่รับค่า ${s.params.join(', ')} คำสั่งข้างในจะทำงานเมื่อมีการเรียกใช้`
        : `สร้างฟังก์ชันชื่อ ${s.name} คำสั่งข้างในจะทำงานเมื่อมีการเรียกใช้`
    case 'Return':
      return s.value ? `ส่ง ${code(s.value)} กลับไปให้ผู้ที่เรียกฟังก์ชัน` : 'ออกจากฟังก์ชันทันที'
    case 'Break':
      return 'ออกจากลูปทันที'
    case 'Continue':
      return 'ข้ามคำสั่งที่เหลือ ไปเริ่มรอบถัดไปของลูป'
    case 'Pass':
      return 'ไม่ทำอะไร ใส่ไว้เพราะ Python ต้องมีคำสั่งอย่างน้อยหนึ่งบรรทัด'
    case 'Raw':
      return s.reason
  }
}
