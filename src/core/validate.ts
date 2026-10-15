// ตรวจโปรแกรมระดับ AST: ช่องว่าง, โครงสร้างไม่สมบูรณ์, ตัวแปรที่ยังไม่กำหนด, ชนิดข้อมูลไม่เข้ากัน
import { exprChildren, type Expr, type Module, type Stmt } from './ast'
import type { Diagnostic } from './parse'

const BUILTINS = new Set([
  'print', 'input', 'len', 'range', 'int', 'float', 'str', 'bool', 'list', 'dict',
  'abs', 'min', 'max', 'sum', 'round', 'sorted', 'type', 'enumerate', 'reversed',
])

type Ty = 'str' | 'num' | 'bool' | 'list' | 'dict' | 'none' | '?'

const TY_TH: Record<Ty, string> = {
  str: 'ข้อความ (str)', num: 'ตัวเลข', bool: 'ค่าความจริง (bool)', list: 'ลิสต์', dict: 'ดิกชันนารี', none: 'None', '?': '?',
}

export function validate(mod: Module): Diagnostic[] {
  const out: Diagnostic[] = []
  const report = (node: Stmt | Expr, at: Stmt, severity: Diagnostic['severity'], message: string) =>
    out.push({ line: node.span?.startLine ?? at.span?.startLine ?? 1, severity, message, blockId: node.id ?? at.id })

  const functions = new Set<string>()
  mod.body.forEach((s) => s.kind === 'FunctionDef' && functions.add(s.name))

  type Ctx = { defined: Set<string>; types: Map<string, Ty>; inLoop: boolean; inFunc: boolean }

  const typeOf = (e: Expr, ctx: Ctx): Ty => {
    switch (e.kind) {
      case 'Str': return 'str'
      case 'Num': return 'num'
      case 'Bool': case 'Compare': case 'Not': return 'bool'
      case 'NoneConst': return 'none'
      case 'List': return 'list'
      case 'Dict': return 'dict'
      case 'Name': return ctx.types.get(e.name) ?? '?'
      case 'Neg': return 'num'
      case 'Call':
        if (e.func === 'input' || e.func === 'str') return 'str'
        if (e.func === 'int' || e.func === 'float' || e.func === 'len' || e.func === 'round') return 'num'
        if (e.func === 'list' || e.func === 'sorted') return 'list'
        return '?'
      case 'BinOp': {
        const l = typeOf(e.left, ctx)
        const r = typeOf(e.right, ctx)
        if (l === 'num' && r === 'num') return 'num'
        if (e.op === '+' && l === 'str' && r === 'str') return 'str'
        return '?'
      }
      default: return '?'
    }
  }

  const checkExpr = (e: Expr, at: Stmt, ctx: Ctx) => {
    switch (e.kind) {
      case 'Hole':
        report(e, at, 'error', 'มีช่องว่างที่ยังไม่ได้ใส่บล็อก')
        return
      case 'Name':
        if (!ctx.defined.has(e.name) && !BUILTINS.has(e.name) && !functions.has(e.name))
          report(e, at, 'error', `ตัวแปร "${e.name}" ถูกใช้ก่อนกำหนดค่า`)
        return
      case 'Call':
        if (!BUILTINS.has(e.func) && !functions.has(e.func) && !ctx.defined.has(e.func))
          report(e, at, 'error', `ไม่รู้จักฟังก์ชัน "${e.func}"`)
        break
      case 'BinOp': {
        const l = typeOf(e.left, ctx)
        const r = typeOf(e.right, ctx)
        const mixed = (l === 'str' && r === 'num') || (l === 'num' && r === 'str')
        if (mixed && e.op === '+') {
          const fromInput = [e.left, e.right].some(
            (x) => (x.kind === 'Call' && x.func === 'input') || (x.kind === 'Name' && ctx.types.get(x.name) === 'str'),
          )
          report(e, at, 'error',
            fromInput
              ? 'นำข้อความมาบวกกับตัวเลขไม่ได้ ค่าจาก input() เป็นข้อความเสมอ ลองครอบด้วย int(...)'
              : 'นำข้อความมาบวกกับตัวเลขไม่ได้ ลองแปลงด้วย str(...) หรือ int(...)')
        } else if ((l === 'str' || r === 'str') && l !== '?' && r !== '?' && e.op !== '+' && !(e.op === '*' && (l === 'num' || r === 'num'))) {
          report(e, at, 'error', `ใช้ ${e.op} กับ ${TY_TH[l]} และ ${TY_TH[r]} ไม่ได้`)
        }
        break
      }
      case 'Compare': {
        const l = typeOf(e.left, ctx)
        const r = typeOf(e.right, ctx)
        if (['<', '<=', '>', '>='].includes(e.op) && ((l === 'str' && r === 'num') || (l === 'num' && r === 'str')))
          report(e, at, 'error', `เปรียบเทียบ ${TY_TH[l]} กับ ${TY_TH[r]} ด้วย ${e.op} ไม่ได้`)
        break
      }
    }
    exprChildren(e).forEach((c) => checkExpr(c, at, ctx))
  }

  const checkBody = (body: Stmt[], ctx: Ctx, owner: Stmt | null, label: string) => {
    if (owner && body.length === 0) report(owner, owner, 'warning', `${label}ยังไม่มีคำสั่งข้างใน`)
    body.forEach((s) => checkStmt(s, ctx))
  }

  const checkStmt = (s: Stmt, ctx: Ctx) => {
    switch (s.kind) {
      case 'Assign':
        checkExpr(s.value, s, ctx)
        ctx.defined.add(s.target)
        ctx.types.set(s.target, typeOf(s.value, ctx))
        break
      case 'AugAssign':
        if (!ctx.defined.has(s.target)) report(s, s, 'error', `ตัวแปร "${s.target}" ต้องมีค่าก่อนจึงจะใช้ ${s.op}= ได้`)
        checkExpr(s.value, s, ctx)
        break
      case 'SubscriptAssign':
        checkExpr(s.target, s, ctx)
        checkExpr(s.index, s, ctx)
        checkExpr(s.value, s, ctx)
        break
      case 'ExprStmt':
        checkExpr(s.expr, s, ctx)
        break
      case 'If':
        s.branches.forEach((b, i) => {
          checkExpr(b.test, s, ctx)
          checkBody(b.body, ctx, s, i === 0 ? 'if ' : 'elif ')
        })
        if (s.orelse) checkBody(s.orelse, ctx, s, 'else ')
        break
      case 'While':
        checkExpr(s.test, s, ctx)
        checkBody(s.body, { ...ctx, inLoop: true }, s, 'while ')
        break
      case 'For':
        checkExpr(s.iter, s, ctx)
        ctx.defined.add(s.target)
        checkBody(s.body, { ...ctx, inLoop: true }, s, 'for ')
        break
      case 'FunctionDef': {
        // ฟังก์ชันมองเห็นตัวแปรระดับบนทั้งหมด (ตามที่ Python ทำตอนเรียกจริง) แบบประมาณ
        const inner: Ctx = {
          defined: new Set([...ctx.defined, ...topLevelNames(mod), ...s.params]),
          types: new Map(),
          inLoop: false,
          inFunc: true,
        }
        checkBody(s.body, inner, s, `ฟังก์ชัน ${s.name} `)
        break
      }
      case 'Return':
        if (!ctx.inFunc) report(s, s, 'error', 'return ใช้ได้เฉพาะในฟังก์ชัน')
        if (s.value) checkExpr(s.value, s, ctx)
        break
      case 'Break':
      case 'Continue':
        if (!ctx.inLoop) report(s, s, 'error', `${s.kind === 'Break' ? 'break' : 'continue'} ใช้ได้เฉพาะในลูป`)
        break
    }
  }

  checkBody(mod.body, { defined: new Set(), types: new Map(), inLoop: false, inFunc: false }, null, '')
  return out
}

function topLevelNames(mod: Module): string[] {
  return mod.body.flatMap((s) => (s.kind === 'Assign' || s.kind === 'For' ? [s.target] : []))
}
