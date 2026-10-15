// AST กลาง (Intermediate Representation) ที่ทั้ง Block Editor และ Python Code View แปลงเข้า-ออก
// ชื่อโหนดอิงตามโมดูล ast ของ Python เพื่อให้ผู้เรียนเชื่อมโยงกับเอกสารจริงได้

export type Span = { startLine: number; endLine: number } // 1-based, รวมปลาย

interface Base {
  id?: string // id ของบล็อกที่ผูกกับโหนดนี้
  span?: Span
}

export type BinOperator = '+' | '-' | '*' | '/' | '//' | '%' | '**'
export type CmpOperator = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not in'

export type Expr =
  | (Base & { kind: 'Name'; name: string })
  | (Base & { kind: 'Num'; value: string })
  | (Base & { kind: 'Str'; value: string })
  | (Base & { kind: 'Bool'; value: boolean })
  | (Base & { kind: 'NoneConst' })
  | (Base & { kind: 'Hole' }) // ช่องที่ผู้เรียนยังไม่ได้ใส่บล็อก
  | (Base & { kind: 'BinOp'; op: BinOperator; left: Expr; right: Expr })
  | (Base & { kind: 'Compare'; op: CmpOperator; left: Expr; right: Expr })
  | (Base & { kind: 'BoolOp'; op: 'and' | 'or'; left: Expr; right: Expr })
  | (Base & { kind: 'Not'; operand: Expr })
  | (Base & { kind: 'Neg'; operand: Expr })
  | (Base & { kind: 'Call'; func: string; args: Expr[] })
  | (Base & { kind: 'MethodCall'; obj: Expr; method: string; args: Expr[] })
  | (Base & { kind: 'List'; items: Expr[] })
  | (Base & { kind: 'Dict'; keys: Expr[]; values: Expr[] })
  | (Base & { kind: 'Subscript'; value: Expr; index: Expr })

export type Stmt =
  | (Base & { kind: 'Assign'; target: string; value: Expr })
  | (Base & { kind: 'SubscriptAssign'; target: Expr; index: Expr; value: Expr })
  | (Base & { kind: 'AugAssign'; target: string; op: BinOperator; value: Expr })
  | (Base & { kind: 'ExprStmt'; expr: Expr })
  | (Base & { kind: 'If'; branches: { test: Expr; body: Stmt[] }[]; orelse: Stmt[] | null })
  | (Base & { kind: 'While'; test: Expr; body: Stmt[] })
  | (Base & { kind: 'For'; target: string; iter: Expr; body: Stmt[] })
  | (Base & { kind: 'FunctionDef'; name: string; params: string[]; body: Stmt[] })
  | (Base & { kind: 'Return'; value: Expr | null })
  | (Base & { kind: 'Break' })
  | (Base & { kind: 'Continue' })
  | (Base & { kind: 'Pass' })

export type Module = { kind: 'Module'; body: Stmt[] }

export type StmtOf<K extends Stmt['kind']> = Extract<Stmt, { kind: K }>
export type ExprOf<K extends Expr['kind']> = Extract<Expr, { kind: K }>

export const HOLE_NAME = '___'

/** เดินทุกโหนดในต้นไม้ (pre-order) */
export function walk(mod: Module, visit: (n: Stmt | Expr, parent: Stmt | Expr | null) => void) {
  const ex = (e: Expr, p: Stmt | Expr) => {
    visit(e, p)
    for (const c of exprChildren(e)) ex(c, e)
  }
  const st = (s: Stmt, p: Stmt | null) => {
    visit(s, p)
    for (const c of stmtExprs(s)) ex(c, s)
    for (const b of stmtBodies(s)) b.forEach((c) => st(c, s))
  }
  mod.body.forEach((s) => st(s, null))
}

export function exprChildren(e: Expr): Expr[] {
  switch (e.kind) {
    case 'BinOp':
    case 'Compare':
    case 'BoolOp':
      return [e.left, e.right]
    case 'Not':
    case 'Neg':
      return [e.operand]
    case 'Call':
      return e.args
    case 'MethodCall':
      return [e.obj, ...e.args]
    case 'List':
      return e.items
    case 'Dict':
      return e.keys.flatMap((k, i) => [k, e.values[i]])
    case 'Subscript':
      return [e.value, e.index]
    default:
      return []
  }
}

export function stmtExprs(s: Stmt): Expr[] {
  switch (s.kind) {
    case 'Assign':
    case 'AugAssign':
      return [s.value]
    case 'SubscriptAssign':
      return [s.target, s.index, s.value]
    case 'ExprStmt':
      return [s.expr]
    case 'If':
      return s.branches.map((b) => b.test)
    case 'While':
      return [s.test]
    case 'For':
      return [s.iter]
    case 'Return':
      return s.value ? [s.value] : []
    default:
      return []
  }
}

export function stmtBodies(s: Stmt): Stmt[][] {
  switch (s.kind) {
    case 'If':
      return [...s.branches.map((b) => b.body), ...(s.orelse ? [s.orelse] : [])]
    case 'While':
    case 'For':
    case 'FunctionDef':
      return [s.body]
    default:
      return []
  }
}
