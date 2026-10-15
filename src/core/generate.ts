// AST → ซอร์สโค้ด Python
// ใส่วงเล็บตามลำดับความสำคัญของตัวดำเนินการ (precedence) จาก AST ไม่ใช่จากข้อความเดิม
import { HOLE_NAME, type Expr, type Module, type Stmt } from './ast'

const INDENT = '    '

const PREC = {
  or: 1,
  and: 2,
  not: 3,
  cmp: 4,
  add: 6,
  mul: 7,
  neg: 8,
  pow: 9,
  atom: 10,
} as const

function binPrec(op: string): number {
  if (op === '+' || op === '-') return PREC.add
  if (op === '**') return PREC.pow
  return PREC.mul
}

export function exprPrec(e: Expr): number {
  switch (e.kind) {
    case 'BoolOp':
      return e.op === 'or' ? PREC.or : PREC.and
    case 'Not':
      return PREC.not
    case 'Compare':
      return PREC.cmp
    case 'BinOp':
      return binPrec(e.op)
    case 'Neg':
      return PREC.neg
    default:
      return PREC.atom
  }
}

function wrap(e: Expr, min: number): string {
  const s = genExpr(e)
  return exprPrec(e) < min ? `(${s})` : s
}

export function genExpr(e: Expr): string {
  switch (e.kind) {
    case 'Name':
      return e.name
    case 'Num':
      return e.value
    case 'Str':
      return JSON.stringify(e.value)
    case 'Bool':
      return e.value ? 'True' : 'False'
    case 'NoneConst':
      return 'None'
    case 'Hole':
      return HOLE_NAME
    case 'BinOp': {
      const p = binPrec(e.op)
      // ** จัดกลุ่มจากขวา ส่วนตัวอื่นจัดกลุ่มจากซ้าย
      const lp = e.op === '**' ? p + 1 : p
      const rp = e.op === '**' ? p : p + 1
      return `${wrap(e.left, lp)} ${e.op} ${wrap(e.right, rp)}`
    }
    case 'Compare':
      return `${wrap(e.left, PREC.cmp + 1)} ${e.op} ${wrap(e.right, PREC.cmp + 1)}`
    case 'BoolOp': {
      const p = exprPrec(e)
      return `${wrap(e.left, p)} ${e.op} ${wrap(e.right, p + 1)}`
    }
    case 'Not':
      return `not ${wrap(e.operand, PREC.not)}`
    case 'Neg':
      return `-${wrap(e.operand, PREC.neg)}`
    case 'Call':
      return `${e.func}(${e.args.map(genExpr).join(', ')})`
    case 'MethodCall':
      return `${wrap(e.obj, PREC.atom)}.${e.method}(${e.args.map(genExpr).join(', ')})`
    case 'List':
      return `[${e.items.map(genExpr).join(', ')}]`
    case 'Dict':
      return `{${e.keys.map((k, i) => `${genExpr(k)}: ${genExpr(e.values[i])}`).join(', ')}}`
    case 'Subscript':
      return `${wrap(e.value, PREC.atom)}[${genExpr(e.index)}]`
  }
}

/** สร้างโค้ดและบันทึก span (บรรทัด) ลงในแต่ละ Stmt เพื่อใช้ไฮไลต์คู่บล็อก-โค้ด */
export function generate(mod: Module): string {
  const lines: string[] = []

  const block = (body: Stmt[], depth: number) => {
    if (body.length === 0) {
      lines.push(INDENT.repeat(depth) + 'pass')
      return
    }
    body.forEach((s) => stmt(s, depth))
  }

  const stmt = (s: Stmt, depth: number) => {
    const pad = INDENT.repeat(depth)
    const start = lines.length + 1
    switch (s.kind) {
      case 'Assign':
        lines.push(`${pad}${s.target} = ${genExpr(s.value)}`)
        break
      case 'SubscriptAssign':
        lines.push(`${pad}${wrap(s.target, PREC.atom)}[${genExpr(s.index)}] = ${genExpr(s.value)}`)
        break
      case 'AugAssign':
        lines.push(`${pad}${s.target} ${s.op}= ${genExpr(s.value)}`)
        break
      case 'ExprStmt':
        lines.push(pad + genExpr(s.expr))
        break
      case 'If':
        s.branches.forEach((b, i) => {
          lines.push(`${pad}${i === 0 ? 'if' : 'elif'} ${genExpr(b.test)}:`)
          block(b.body, depth + 1)
        })
        if (s.orelse) {
          lines.push(`${pad}else:`)
          block(s.orelse, depth + 1)
        }
        break
      case 'While':
        lines.push(`${pad}while ${genExpr(s.test)}:`)
        block(s.body, depth + 1)
        break
      case 'For':
        lines.push(`${pad}for ${s.target} in ${genExpr(s.iter)}:`)
        block(s.body, depth + 1)
        break
      case 'FunctionDef':
        lines.push(`${pad}def ${s.name}(${s.params.join(', ')}):`)
        block(s.body, depth + 1)
        break
      case 'Return':
        lines.push(s.value ? `${pad}return ${genExpr(s.value)}` : `${pad}return`)
        break
      case 'Break':
        lines.push(pad + 'break')
        break
      case 'Continue':
        lines.push(pad + 'continue')
        break
      case 'Pass':
        lines.push(pad + 'pass')
        break
    }
    s.span = { startLine: start, endLine: lines.length }
  }

  // เว้นบรรทัดรอบ def ระดับบนสุด
  mod.body.forEach((s, i) => {
    const prev = mod.body[i - 1]
    if (prev && (s.kind === 'FunctionDef' || prev.kind === 'FunctionDef')) lines.push('')
    stmt(s, 0)
  })
  return lines.join('\n') + (lines.length ? '\n' : '')
}
