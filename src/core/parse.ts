// ซอร์สโค้ด Python → (Tree-sitter CST) → AST กลาง
import Parser from 'web-tree-sitter'
import type { BinOperator, CmpOperator, Expr, Module, Stmt } from './ast'
import { HOLE_NAME } from './ast'

export type Diagnostic = {
  line: number // 1-based
  message: string
  severity: 'error' | 'warning'
  blockId?: string
}

export type ParseResult = { module: Module | null; diagnostics: Diagnostic[] }

type Node = Parser.SyntaxNode

let parserPromise: Promise<Parser> | null = null

/** โหลด Tree-sitter ครั้งเดียว ผู้เรียกส่งตัวหาไฟล์ wasm ให้ (เบราว์เซอร์ใช้ URL, เทสต์ใช้ไฟล์) */
export function initParser(opts: {
  locateFile?: (name: string) => string
  language: string | Uint8Array
}): Promise<Parser> {
  parserPromise ??= (async () => {
    await Parser.init(opts.locateFile ? { locateFile: opts.locateFile } : undefined)
    const lang = await Parser.Language.load(opts.language)
    const p = new Parser()
    p.setLanguage(lang)
    return p
  })()
  return parserPromise
}

class Unsupported extends Error {
  node: Node
  constructor(node: Node, message: string) {
    super(message)
    this.node = node
  }
}

const line = (n: Node) => n.startPosition.row + 1
const span = (n: Node) => ({ startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1 })

const BIN_OPS = new Set(['+', '-', '*', '/', '//', '%', '**'])
const CMP_OPS = new Set(['==', '!=', '<', '<=', '>', '>=', 'in', 'not in'])

const UNSUPPORTED_LABEL: Record<string, string> = {
  class_definition: 'การสร้างคลาส (class)',
  try_statement: 'การจัดการข้อยกเว้น (try/except)',
  import_statement: 'การนำเข้าไลบรารี (import)',
  import_from_statement: 'การนำเข้าไลบรารี (from ... import)',
  with_statement: 'คำสั่ง with',
  lambda: 'ฟังก์ชัน lambda',
  list_comprehension: 'list comprehension',
  dictionary_comprehension: 'dict comprehension',
  tuple: 'tuple',
  conditional_expression: 'if แบบบรรทัดเดียว',
  slice: 'การตัดช่วง (slice)',
}

function unsupported(n: Node): never {
  const what = UNSUPPORTED_LABEL[n.type]
  throw new Unsupported(
    n,
    what
      ? `ระบบยังไม่รองรับ${what} จึงแปลงเป็นบล็อกไม่ได้`
      : `ระบบยังไม่รองรับโครงสร้าง "${n.text.split('\n')[0].slice(0, 40)}" จึงแปลงเป็นบล็อกไม่ได้`,
  )
}

function field(n: Node, name: string): Node {
  const c = n.childForFieldName(name)
  if (!c) unsupported(n)
  return c
}

function body(n: Node | null): Stmt[] {
  if (!n) return []
  return n.namedChildren.filter((c) => c.type !== 'comment').flatMap(stmt)
}

function stmt(n: Node): Stmt[] {
  const s = span(n)
  switch (n.type) {
    case 'expression_statement': {
      const inner = n.namedChildren[0]
      if (n.namedChildren.length !== 1) unsupported(n)
      if (inner.type === 'assignment') {
        const left = field(inner, 'left')
        const right = inner.childForFieldName('right')
        if (!right || inner.childForFieldName('type')) unsupported(inner)
        if (left.type === 'identifier') return [{ kind: 'Assign', target: left.text, value: expr(right), span: s }]
        if (left.type === 'subscript')
          return [
            {
              kind: 'SubscriptAssign',
              target: expr(field(left, 'value')),
              index: expr(field(left, 'subscript')),
              value: expr(right),
              span: s,
            },
          ]
        unsupported(inner)
      }
      if (inner.type === 'augmented_assignment') {
        const left = field(inner, 'left')
        const op = field(inner, 'operator').text.slice(0, -1)
        if (left.type !== 'identifier' || !BIN_OPS.has(op)) unsupported(inner)
        return [{ kind: 'AugAssign', target: left.text, op: op as BinOperator, value: expr(field(inner, 'right')), span: s }]
      }
      return [{ kind: 'ExprStmt', expr: expr(inner), span: s }]
    }
    case 'if_statement': {
      const branches = [{ test: expr(field(n, 'condition')), body: body(n.childForFieldName('consequence')) }]
      let orelse: Stmt[] | null = null
      for (const alt of n.childrenForFieldName('alternative')) {
        if (alt.type === 'elif_clause')
          branches.push({ test: expr(field(alt, 'condition')), body: body(alt.childForFieldName('consequence')) })
        else orelse = body(alt.childForFieldName('body'))
      }
      return [{ kind: 'If', branches, orelse, span: s }]
    }
    case 'while_statement':
      if (n.childForFieldName('alternative')) unsupported(n)
      return [{ kind: 'While', test: expr(field(n, 'condition')), body: body(n.childForFieldName('body')), span: s }]
    case 'for_statement': {
      const left = field(n, 'left')
      if (left.type !== 'identifier' || n.childForFieldName('alternative')) unsupported(n)
      return [{ kind: 'For', target: left.text, iter: expr(field(n, 'right')), body: body(n.childForFieldName('body')), span: s }]
    }
    case 'function_definition': {
      const params = field(n, 'parameters').namedChildren.map((p) => {
        if (p.type !== 'identifier') unsupported(p)
        return p.text
      })
      return [{ kind: 'FunctionDef', name: field(n, 'name').text, params, body: body(n.childForFieldName('body')), span: s }]
    }
    case 'return_statement': {
      const v = n.namedChildren[0]
      return [{ kind: 'Return', value: v ? expr(v) : null, span: s }]
    }
    case 'break_statement':
      return [{ kind: 'Break', span: s }]
    case 'continue_statement':
      return [{ kind: 'Continue', span: s }]
    case 'pass_statement':
      return [{ kind: 'Pass', span: s }]
    default:
      unsupported(n)
  }
}

function args(n: Node): Expr[] {
  return n.namedChildren.filter((c) => c.type !== 'comment').map((a) => {
    if (a.type === 'keyword_argument' || a.type === 'list_splat' || a.type === 'dictionary_splat') unsupported(a)
    return expr(a)
  })
}

function expr(n: Node): Expr {
  const s = span(n)
  switch (n.type) {
    case 'identifier':
      return n.text === HOLE_NAME ? { kind: 'Hole', span: s } : { kind: 'Name', name: n.text, span: s }
    case 'integer':
    case 'float':
      return { kind: 'Num', value: n.text, span: s }
    case 'string': {
      if (n.namedChildren.some((c) => c.type === 'interpolation')) unsupported(n)
      const start = n.namedChildren.find((c) => c.type === 'string_start')
      if (start && /[rbfu]/i.test(start.text.replace(/['"]/g, ''))) unsupported(n)
      const raw = n.namedChildren.filter((c) => c.type === 'string_content' || c.type === 'escape_sequence')
      return { kind: 'Str', value: unescape(raw.map((c) => c.text).join('')), span: s }
    }
    case 'concatenated_string':
      unsupported(n)
    case 'true':
      return { kind: 'Bool', value: true, span: s }
    case 'false':
      return { kind: 'Bool', value: false, span: s }
    case 'none':
      return { kind: 'NoneConst', span: s }
    case 'parenthesized_expression':
      // วงเล็บไม่อยู่ใน AST ตัวสร้างโค้ดจะใส่คืนตามลำดับความสำคัญ
      return expr(n.namedChildren[0])
    case 'binary_operator': {
      const op = field(n, 'operator').text
      if (!BIN_OPS.has(op)) unsupported(n)
      return { kind: 'BinOp', op: op as BinOperator, left: expr(field(n, 'left')), right: expr(field(n, 'right')), span: s }
    }
    case 'comparison_operator': {
      const operands = n.namedChildren
      const ops = n.children.filter((c) => !c.isNamed).map((c) => c.text)
      // "not in" มาเป็นสองโทเคน
      const op = ops.join(' ')
      if (operands.length !== 2 || !CMP_OPS.has(op)) unsupported(n)
      return { kind: 'Compare', op: op as CmpOperator, left: expr(operands[0]), right: expr(operands[1]), span: s }
    }
    case 'boolean_operator':
      return {
        kind: 'BoolOp',
        op: field(n, 'operator').text as 'and' | 'or',
        left: expr(field(n, 'left')),
        right: expr(field(n, 'right')),
        span: s,
      }
    case 'not_operator':
      return { kind: 'Not', operand: expr(field(n, 'argument')), span: s }
    case 'unary_operator': {
      const op = field(n, 'operator').text
      const arg = expr(field(n, 'argument'))
      if (op === '+') return arg
      if (op !== '-') unsupported(n)
      // -5 เก็บเป็นตัวเลขติดลบเลย ให้บล็อกดูง่าย
      if (arg.kind === 'Num') return { kind: 'Num', value: '-' + arg.value, span: s }
      return { kind: 'Neg', operand: arg, span: s }
    }
    case 'call': {
      const fn = field(n, 'function')
      const a = args(field(n, 'arguments'))
      if (fn.type === 'identifier') return { kind: 'Call', func: fn.text, args: a, span: s }
      if (fn.type === 'attribute')
        return { kind: 'MethodCall', obj: expr(field(fn, 'object')), method: field(fn, 'attribute').text, args: a, span: s }
      unsupported(n)
    }
    case 'list':
      return { kind: 'List', items: args(n), span: s }
    case 'dictionary': {
      const keys: Expr[] = []
      const values: Expr[] = []
      for (const p of n.namedChildren) {
        if (p.type === 'comment') continue
        if (p.type !== 'pair') unsupported(p)
        keys.push(expr(field(p, 'key')))
        values.push(expr(field(p, 'value')))
      }
      return { kind: 'Dict', keys, values, span: s }
    }
    case 'subscript': {
      const subs = n.childrenForFieldName('subscript')
      if (subs.length !== 1) unsupported(n)
      return { kind: 'Subscript', value: expr(field(n, 'value')), index: expr(subs[0]), span: s }
    }
    default:
      unsupported(n)
  }
}

function unescape(raw: string): string {
  return raw.replace(/\\(n|t|\\|'|")/g, (_, c) => ({ n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' })[c as string]!)
}

function syntaxErrors(root: Node): Diagnostic[] {
  const out: Diagnostic[] = []
  const visit = (n: Node) => {
    if (n.isMissing) {
      out.push({ line: line(n), severity: 'error', message: `ไวยากรณ์ผิด: น่าจะขาด "${n.type}"` })
      return
    }
    if (n.type === 'ERROR') {
      const first = n.text.split('\n')[0].trim().slice(0, 30)
      out.push({ line: line(n), severity: 'error', message: `ไวยากรณ์ผิดใกล้ "${first}"` })
      return
    }
    if (n.hasError) n.children.forEach(visit)
  }
  visit(root)
  return out
}

export function parsePython(parser: Parser, code: string): ParseResult {
  const tree = parser.parse(code)
  try {
    const root = tree.rootNode
    if (root.hasError) return { module: null, diagnostics: syntaxErrors(root) }
    const diagnostics: Diagnostic[] = []
    const stmts: Stmt[] = []
    for (const c of root.namedChildren) {
      if (c.type === 'comment') continue
      try {
        stmts.push(...stmt(c))
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e
        diagnostics.push({ line: line(e.node), severity: 'error', message: e.message })
      }
    }
    return { module: diagnostics.length ? null : { kind: 'Module', body: stmts }, diagnostics }
  } finally {
    tree.delete()
  }
}
