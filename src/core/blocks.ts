// นิยามบล็อก Blockly: คำอธิบายภาษาไทยคู่กับคำสั่ง Python จริง
// และตัวแปลง Blocks ⇄ AST
import * as Blockly from 'blockly/core'
import { reindentRaw, type BinOperator, type CmpOperator, type Expr, type Module, type Stmt } from './ast'

export const COLORS = {
  // เข้มพอให้ตัวอักษรขาวบนบล็อกอ่านได้ (≥4.5:1)
  variable: '#b0306a',
  io: '#2856c9',
  logic: '#8f5400',
  loop: '#1f7a4f',
  func: '#6a3fc4',
  math: '#4a4fc4',
  text: '#0e7266',
  data: '#a8481c',
  raw: '#55534d',
  broken: '#a3242a',
} as const

const icon = (sign: '+' | '−') =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7.5" fill="rgba(255,255,255,0.28)"/>` +
      `<path d="M4.5 8h7${sign === '+' ? 'M8 4.5v7' : ''}" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  )

type Dyn = Blockly.Block & { count: number; minCount: number; updateShape(): void }

/** บล็อกที่มีจำนวนช่องอาร์กิวเมนต์ปรับได้ด้วยปุ่ม + / − */
function dynamicArgs(opts: {
  min: number
  initial: number
  build(block: Dyn): void // สร้างส่วนหัว (ก่อนช่อง ARG)
  arg(block: Dyn, i: number): void // สร้างช่องที่ i
  tail?(block: Dyn): void
}) {
  return {
    init(this: Dyn) {
      this.count = opts.initial
      this.minCount = opts.min
      opts.build(this)
      this.updateShape()
    },
    saveExtraState(this: Dyn) {
      return { count: this.count }
    },
    loadExtraState(this: Dyn, state: { count: number }) {
      this.count = state.count
      this.updateShape()
    },
    updateShape(this: Dyn) {
      // เก็บบล็อกที่ต่ออยู่ไว้ แล้วสร้างช่องใหม่ เพื่อไม่ให้บล็อกลูกหลุดตอนกด + / −
      const saved = new Map<string, Blockly.Connection>()
      for (const input of [...this.inputList]) {
        if (!/^(ARG|KEY)\d+$|^TAIL$|^CTRL$/.test(input.name)) continue
        const t = input.connection?.targetConnection
        if (t) saved.set(input.name, t)
        this.removeInput(input.name)
      }
      for (let i = 0; i < this.count; i++) opts.arg(this, i)
      opts.tail?.(this)
      const ctrl = this.appendDummyInput('CTRL')
      ctrl.appendField(
        new Blockly.FieldImage(icon('+'), 16, 16, 'เพิ่มช่อง', () => {
          this.count++
          this.updateShape()
        }),
      )
      if (this.count > this.minCount)
        ctrl.appendField(
          new Blockly.FieldImage(icon('−'), 16, 16, 'ลบช่อง', () => {
            this.count--
            this.updateShape()
          }),
        )
      for (const [name, target] of saved) {
        const input = this.getInput(name)
        if (input?.connection && !target.isConnected()) input.connection.connect(target)
      }
    },
  }
}

const BIN_OPS: [string, BinOperator][] = [['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['//', '//'], ['%', '%'], ['**', '**']]
const CMP_OPS: [string, CmpOperator][] = [['==', '=='], ['!=', '!='], ['<', '<'], ['<=', '<='], ['>', '>'], ['>=', '>='], ['in', 'in'], ['not in', 'not in']]

type IfBlock = Blockly.Block & { elifCount: number; hasElse: boolean; updateShape(): void }
type RawBlock = Blockly.Block & { code: string; indent: number; reason: string; broken: boolean; updateShape(): void }

let registered = false
export function registerBlocks() {
  if (registered) return
  registered = true

  Blockly.common.defineBlocksWithJsonArray([
    // ---------- ตัวแปร ----------
    {
      type: 'py_assign',
      message0: 'กำหนด %1 = %2',
      args0: [
        { type: 'field_input', name: 'VAR', text: 'x', spellcheck: false },
        { type: 'input_value', name: 'VALUE' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.variable,
      tooltip: 'กำหนดค่าให้ตัวแปร',
    },
    {
      type: 'py_augassign',
      message0: '%1 %2 %3',
      args0: [
        { type: 'field_input', name: 'VAR', text: 'x', spellcheck: false },
        { type: 'field_dropdown', name: 'OP', options: BIN_OPS.map(([l, v]) => [l + '=', v]) },
        { type: 'input_value', name: 'VALUE' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.variable,
      tooltip: 'เปลี่ยนค่าตัวแปรจากค่าเดิม เช่น x += 1',
    },
    {
      type: 'py_name',
      message0: '%1',
      args0: [{ type: 'field_input', name: 'NAME', text: 'x', spellcheck: false }],
      output: null,
      colour: COLORS.variable,
      tooltip: 'อ่านค่าตัวแปร',
    },
    {
      type: 'py_subscript_assign',
      message0: 'กำหนด %1 [ %2 ] = %3',
      args0: [
        { type: 'input_value', name: 'TARGET' },
        { type: 'input_value', name: 'INDEX' },
        { type: 'input_value', name: 'VALUE' },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.data,
      tooltip: 'เปลี่ยนค่าในลิสต์หรือดิกชันนารีที่ตำแหน่ง/คีย์ที่กำหนด',
    },
    // ---------- ค่าคงที่ ----------
    {
      type: 'py_num',
      message0: '%1',
      args0: [{ type: 'field_input', name: 'NUM', text: '0', spellcheck: false }],
      output: 'Number',
      colour: COLORS.math,
    },
    {
      type: 'py_str',
      message0: '" %1 "',
      args0: [{ type: 'field_input', name: 'TEXT', text: '' }],
      output: 'String',
      colour: COLORS.text,
    },
    {
      type: 'py_bool',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'BOOL', options: [['True', 'TRUE'], ['False', 'FALSE']] }],
      output: 'Boolean',
      colour: COLORS.logic,
    },
    { type: 'py_none', message0: 'None', output: null, colour: COLORS.logic },
    // ---------- ตัวดำเนินการ ----------
    {
      type: 'py_binop',
      message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'field_dropdown', name: 'OP', options: BIN_OPS },
        { type: 'input_value', name: 'B' },
      ],
      inputsInline: true,
      output: null,
      colour: COLORS.math,
    },
    {
      type: 'py_compare',
      message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'field_dropdown', name: 'OP', options: CMP_OPS },
        { type: 'input_value', name: 'B' },
      ],
      inputsInline: true,
      output: 'Boolean',
      colour: COLORS.logic,
    },
    {
      type: 'py_boolop',
      message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'field_dropdown', name: 'OP', options: [['และ and', 'and'], ['หรือ or', 'or']] },
        { type: 'input_value', name: 'B' },
      ],
      inputsInline: true,
      output: 'Boolean',
      colour: COLORS.logic,
    },
    {
      type: 'py_not',
      message0: 'ไม่ใช่ not %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'Boolean',
      colour: COLORS.logic,
    },
    {
      type: 'py_neg',
      message0: '- %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: null,
      colour: COLORS.math,
    },
    {
      type: 'py_subscript',
      message0: '%1 [ %2 ]',
      args0: [
        { type: 'input_value', name: 'VALUE' },
        { type: 'input_value', name: 'INDEX' },
      ],
      inputsInline: true,
      output: null,
      colour: COLORS.data,
    },
    // ---------- การควบคุม ----------
    {
      type: 'py_while',
      message0: 'ทำซ้ำขณะที่ while %1 :',
      args0: [{ type: 'input_value', name: 'COND' }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.loop,
      tooltip: 'ทำซ้ำตราบใดที่เงื่อนไขยังเป็นจริง',
    },
    {
      type: 'py_for',
      message0: 'ทำซ้ำ for %1 in %2 :',
      args0: [
        { type: 'field_input', name: 'VAR', text: 'i', spellcheck: false },
        { type: 'input_value', name: 'ITER' },
      ],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.loop,
      tooltip: 'ทำซ้ำกับสมาชิกแต่ละตัว เช่น for i in range(5)',
    },
    { type: 'py_break', message0: 'ออกจากลูป break', previousStatement: null, colour: COLORS.loop, tooltip: 'ออกจากลูปทันที' },
    { type: 'py_continue', message0: 'ข้ามรอบ continue', previousStatement: null, colour: COLORS.loop, tooltip: 'ข้ามไปรอบถัดไปของลูป' },
    { type: 'py_pass', message0: 'ไม่ทำอะไร pass', previousStatement: null, nextStatement: null, colour: COLORS.loop, tooltip: 'คำสั่งที่ไม่ทำอะไร' },
    // ---------- ฟังก์ชัน ----------
    {
      type: 'py_def',
      message0: 'นิยามฟังก์ชัน def %1 ( %2 ) :',
      args0: [
        { type: 'field_input', name: 'NAME', text: 'my_function', spellcheck: false },
        { type: 'field_input', name: 'PARAMS', text: '', spellcheck: false },
      ],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.func,
      tooltip: 'สร้างฟังก์ชัน ใส่ชื่อพารามิเตอร์คั่นด้วยจุลภาค',
    },
    {
      type: 'py_return',
      message0: 'คืนค่า return %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      previousStatement: null,
      colour: COLORS.func,
      tooltip: 'ส่งค่ากลับจากฟังก์ชัน',
    },
    {
      type: 'py_expr_stmt',
      message0: '%1',
      args0: [{ type: 'input_value', name: 'EXPR' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.func,
      tooltip: 'เรียกฟังก์ชันหรือเมธอดเป็นคำสั่งหนึ่งบรรทัด',
    },
  ])

  // print(...) เป็นคำสั่ง
  Blockly.Blocks['py_print'] = dynamicArgs({
    min: 0,
    initial: 1,
    build(b) {
      b.appendDummyInput().appendField('แสดงผล print (')
      b.setInputsInline(true)
      b.setPreviousStatement(true)
      b.setNextStatement(true)
      b.setColour(COLORS.io)
      b.setTooltip('แสดงผลออกทางหน้าจอ')
    },
    arg: (b, i) => b.appendValueInput('ARG' + i).appendField(i > 0 ? ',' : ''),
    tail: (b) => b.appendDummyInput('TAIL').appendField(')'),
  })

  // ฟังก์ชันที่คืนค่า เช่น input(...), len(...), range(...)
  Blockly.Blocks['py_call'] = dynamicArgs({
    min: 0,
    initial: 1,
    build(b) {
      b.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('len'), 'FUNC')
        .appendField('(')
      b.setInputsInline(true)
      b.setOutput(true)
      b.setColour(COLORS.func)
      b.setTooltip('เรียกฟังก์ชัน')
    },
    arg: (b, i) => b.appendValueInput('ARG' + i).appendField(i > 0 ? ',' : ''),
    tail: (b) => b.appendDummyInput('TAIL').appendField(')'),
  })

  // เมธอด เช่น nums.append(x)
  Blockly.Blocks['py_method'] = dynamicArgs({
    min: 0,
    initial: 1,
    build(b) {
      b.appendValueInput('OBJ')
      b.appendDummyInput()
        .appendField('.')
        .appendField(new Blockly.FieldTextInput('append'), 'METHOD')
        .appendField('(')
      b.setInputsInline(true)
      b.setOutput(true)
      b.setColour(COLORS.data)
      b.setTooltip('เรียกเมธอดของข้อมูล')
    },
    arg: (b, i) => b.appendValueInput('ARG' + i).appendField(i > 0 ? ',' : ''),
    tail: (b) => b.appendDummyInput('TAIL').appendField(')'),
  })

  Blockly.Blocks['py_list'] = dynamicArgs({
    min: 0,
    initial: 3,
    build(b) {
      b.appendDummyInput().appendField('รายการ [')
      b.setInputsInline(true)
      b.setOutput(true, 'List')
      b.setColour(COLORS.data)
      b.setTooltip('ลิสต์')
    },
    arg: (b, i) => b.appendValueInput('ARG' + i).appendField(i > 0 ? ',' : ''),
    tail: (b) => b.appendDummyInput('TAIL').appendField(']'),
  })

  // ดิกชันนารี: คู่ช่อง KEYi : ARGi
  Blockly.Blocks['py_dict'] = dynamicArgs({
      min: 0,
      initial: 1,
      build(b) {
        b.appendDummyInput().appendField('พจนานุกรม {')
        b.setInputsInline(true)
        b.setOutput(true, 'Dict')
        b.setColour(COLORS.data)
        b.setTooltip('ดิกชันนารี คู่ คีย์: ค่า')
      },
      arg: (b, i) => {
        b.appendValueInput('KEY' + i).appendField(i > 0 ? ',' : '')
        b.appendValueInput('ARG' + i).appendField(':')
      },
      tail: (b) => b.appendDummyInput('TAIL').appendField('}'),
  })

  // if / elif / else
  Blockly.Blocks['py_if'] = {
    init(this: IfBlock) {
      this.elifCount = 0
      this.hasElse = false
      this.setPreviousStatement(true)
      this.setNextStatement(true)
      this.setColour(COLORS.logic)
      this.setTooltip('ทำคำสั่งข้างในเมื่อเงื่อนไขเป็นจริง')
      this.updateShape()
    },
    saveExtraState(this: IfBlock) {
      return { elif: this.elifCount, else: this.hasElse }
    },
    loadExtraState(this: IfBlock, s: { elif: number; else: boolean }) {
      this.elifCount = s.elif
      this.hasElse = s.else
      this.updateShape()
    },
    updateShape(this: IfBlock) {
      // เก็บบล็อกที่ต่ออยู่ไว้ แล้วสร้างช่องใหม่ทั้งหมด
      const saved = new Map<string, Blockly.Connection | null>()
      for (const input of [...this.inputList]) {
        saved.set(input.name, input.connection?.targetConnection ?? null)
        this.removeInput(input.name)
      }
      const cond = this.appendValueInput('IF0').setCheck(null).appendField('ถ้า if')
      cond.appendField(
        new Blockly.FieldImage(icon('+'), 16, 16, 'เพิ่ม elif', () => {
          this.elifCount++
          this.updateShape()
        }),
      )
      this.appendDummyInput('COLON0').appendField(':')
      this.appendStatementInput('DO0')
      for (let i = 1; i <= this.elifCount; i++) {
        const row = this.appendValueInput('IF' + i).appendField('มิฉะนั้นถ้า elif')
        if (i === this.elifCount)
          row.appendField(
            new Blockly.FieldImage(icon('−'), 16, 16, 'ลบ elif', () => {
              this.elifCount--
              this.updateShape()
            }),
          )
        this.appendDummyInput('COLON' + i).appendField(':')
        this.appendStatementInput('DO' + i)
      }
      const elseRow = this.appendDummyInput('ELSE_LABEL')
      if (this.hasElse) {
        elseRow.appendField('มิฉะนั้น else :').appendField(
          new Blockly.FieldImage(icon('−'), 16, 16, 'ลบ else', () => {
            this.hasElse = false
            this.updateShape()
          }),
        )
        this.appendStatementInput('ELSE')
      } else {
        elseRow.appendField(
          new Blockly.FieldImage(icon('+'), 16, 16, 'เพิ่ม else', () => {
            this.hasElse = true
            this.updateShape()
          }),
        ).appendField('มิฉะนั้น else')
      }
      this.setInputsInline(false)
      for (const [name, target] of saved) {
        const input = this.getInput(name)
        if (target && input?.connection && !target.isConnected()) input.connection.connect(target)
      }
    },
  }
}

// โค้ดที่ยังไม่มีบล็อกรองรับ: แสดงโค้ดอ่านอย่างเดียว ให้แก้ในช่องโค้ด
Blockly.Blocks['py_raw'] = {
  init(this: RawBlock) {
    this.code = ''
    this.indent = 0
    this.reason = ''
    this.broken = false
    this.setPreviousStatement(true)
    this.setNextStatement(true)
    this.setColour(COLORS.raw)
    this.setTooltip('โค้ดที่ยังไม่มีบล็อกรองรับ แก้ไขได้ในช่องโค้ด Python')
    this.updateShape()
  },
  saveExtraState(this: RawBlock) {
    return { code: this.code, indent: this.indent, reason: this.reason, broken: this.broken }
  },
  loadExtraState(this: RawBlock, s: { code: string; indent: number; reason: string; broken?: boolean }) {
    this.code = s.code
    this.indent = s.indent
    this.reason = s.reason
    this.broken = !!s.broken
    this.updateShape()
  },
  updateShape(this: RawBlock) {
    for (const input of [...this.inputList]) this.removeInput(input.name)
    this.setColour(this.broken ? COLORS.broken : COLORS.raw)
    this.appendDummyInput('HEAD').appendField(this.broken ? 'โค้ดที่ไวยากรณ์ยังผิด' : 'โค้ด Python (ยังไม่มีบล็อก)')
    reindentRaw({ kind: 'Raw', code: this.code, indent: this.indent, reason: '' }, '').forEach((l, i) => this.appendDummyInput('L' + i).appendField(new Blockly.FieldLabel(l || ' ', 'blk-code')))
  },
}

// =============================================================
// Blocks → AST
// =============================================================

export function workspaceToAst(ws: Blockly.Workspace): Module {
  const tops = ws.getTopBlocks(true).filter((b) => b.previousConnection || b.nextConnection)
  return { kind: 'Module', body: tops.flatMap((b) => chain(b)) }
}

function chain(first: Blockly.Block | null): Stmt[] {
  const out: Stmt[] = []
  for (let b = first; b; b = b.getNextBlock()) {
    if (!b.isEnabled()) continue
    out.push(blockStmt(b))
  }
  return out
}

const hole = (): Expr => ({ kind: 'Hole' })
const val = (b: Blockly.Block, input: string): Expr => {
  const t = b.getInputTargetBlock(input)
  return t ? blockExpr(t) : hole()
}
const argList = (b: Blockly.Block): Expr[] => {
  const out: Expr[] = []
  for (let i = 0; b.getInput('ARG' + i); i++) out.push(val(b, 'ARG' + i))
  return out
}

function blockStmt(b: Blockly.Block): Stmt {
  const id = b.id
  const f = (n: string) => String(b.getFieldValue(n) ?? '')
  switch (b.type) {
    case 'py_assign':
      return { kind: 'Assign', id, target: f('VAR'), value: val(b, 'VALUE') }
    case 'py_augassign':
      return { kind: 'AugAssign', id, target: f('VAR'), op: f('OP') as BinOperator, value: val(b, 'VALUE') }
    case 'py_subscript_assign':
      return { kind: 'SubscriptAssign', id, target: val(b, 'TARGET'), index: val(b, 'INDEX'), value: val(b, 'VALUE') }
    case 'py_print':
      return { kind: 'ExprStmt', id, expr: { kind: 'Call', id, func: 'print', args: argList(b) } }
    case 'py_expr_stmt':
      return { kind: 'ExprStmt', id, expr: val(b, 'EXPR') }
    case 'py_if': {
      const ib = b as IfBlock
      const branches = []
      for (let i = 0; i <= ib.elifCount; i++)
        branches.push({ test: val(b, 'IF' + i), body: chain(b.getInputTargetBlock('DO' + i)) })
      return { kind: 'If', id, branches, orelse: ib.hasElse ? chain(b.getInputTargetBlock('ELSE')) : null }
    }
    case 'py_while':
      return { kind: 'While', id, test: val(b, 'COND'), body: chain(b.getInputTargetBlock('DO')) }
    case 'py_for':
      return { kind: 'For', id, target: f('VAR'), iter: val(b, 'ITER'), body: chain(b.getInputTargetBlock('DO')) }
    case 'py_def':
      return {
        kind: 'FunctionDef',
        id,
        name: f('NAME'),
        params: f('PARAMS').split(',').map((p) => p.trim()).filter(Boolean),
        body: chain(b.getInputTargetBlock('DO')),
      }
    case 'py_return': {
      const t = b.getInputTargetBlock('VALUE')
      return { kind: 'Return', id, value: t ? blockExpr(t) : null }
    }
    case 'py_break':
      return { kind: 'Break', id }
    case 'py_continue':
      return { kind: 'Continue', id }
    case 'py_pass':
      return { kind: 'Pass', id }
    case 'py_raw': {
      const r = b as RawBlock
      return { kind: 'Raw', id, code: r.code, indent: r.indent, reason: r.reason, broken: r.broken || undefined }
    }
    default:
      throw new Error('บล็อกคำสั่งไม่รู้จัก: ' + b.type)
  }
}

function blockExpr(b: Blockly.Block): Expr {
  const id = b.id
  const f = (n: string) => String(b.getFieldValue(n) ?? '')
  switch (b.type) {
    case 'py_name':
      return { kind: 'Name', id, name: f('NAME') }
    case 'py_num':
      return { kind: 'Num', id, value: f('NUM').trim() || '0' }
    case 'py_str':
      return { kind: 'Str', id, value: f('TEXT') }
    case 'py_bool':
      return { kind: 'Bool', id, value: f('BOOL') === 'TRUE' }
    case 'py_none':
      return { kind: 'NoneConst', id }
    case 'py_binop':
      return { kind: 'BinOp', id, op: f('OP') as BinOperator, left: val(b, 'A'), right: val(b, 'B') }
    case 'py_compare':
      return { kind: 'Compare', id, op: f('OP') as CmpOperator, left: val(b, 'A'), right: val(b, 'B') }
    case 'py_boolop':
      return { kind: 'BoolOp', id, op: f('OP') as 'and' | 'or', left: val(b, 'A'), right: val(b, 'B') }
    case 'py_not':
      return { kind: 'Not', id, operand: val(b, 'VALUE') }
    case 'py_neg':
      return { kind: 'Neg', id, operand: val(b, 'VALUE') }
    case 'py_call':
      return { kind: 'Call', id, func: f('FUNC'), args: argList(b) }
    case 'py_method':
      return { kind: 'MethodCall', id, obj: val(b, 'OBJ'), method: f('METHOD'), args: argList(b) }
    case 'py_list':
      return { kind: 'List', id, items: argList(b) }
    case 'py_dict': {
      const keys: Expr[] = []
      const values: Expr[] = []
      for (let i = 0; b.getInput('KEY' + i); i++) {
        keys.push(val(b, 'KEY' + i))
        values.push(val(b, 'ARG' + i))
      }
      return { kind: 'Dict', id, keys, values }
    }
    case 'py_subscript':
      return { kind: 'Subscript', id, value: val(b, 'VALUE'), index: val(b, 'INDEX') }
    default:
      throw new Error('บล็อกค่าไม่รู้จัก: ' + b.type)
  }
}

// =============================================================
// AST → Blocks (รูปแบบ serialization JSON ของ Blockly)
// =============================================================

type BlockState = {
  type: string
  id?: string
  x?: number
  y?: number
  fields?: Record<string, string>
  inputs?: Record<string, { block: BlockState }>
  next?: { block: BlockState }
  extraState?: unknown
}

export function astToWorkspaceState(mod: Module) {
  const first = stmtChain(mod.body)
  return {
    blocks: { languageVersion: 0, blocks: first ? [{ ...first, x: 24, y: 24 }] : [] },
  }
}

function stmtChain(stmts: Stmt[]): BlockState | null {
  let head: BlockState | null = null
  for (let i = stmts.length - 1; i >= 0; i--) {
    const s = stmtState(stmts[i])
    if (head) s.next = { block: head }
    head = s
  }
  return head
}

function withInputs(state: BlockState, inputs: Record<string, BlockState | null>): BlockState {
  const entries = Object.entries(inputs).filter((e): e is [string, BlockState] => e[1] !== null)
  if (entries.length) state.inputs = Object.fromEntries(entries.map(([k, v]) => [k, { block: v }]))
  return state
}

function exprIn(e: Expr): BlockState | null {
  return e.kind === 'Hole' ? null : exprState(e)
}

function argInputs(args: Expr[]): Record<string, BlockState | null> {
  return Object.fromEntries(args.map((a, i) => ['ARG' + i, exprIn(a)]))
}

function stmtState(s: Stmt): BlockState {
  switch (s.kind) {
    case 'Assign':
      return withInputs({ type: 'py_assign', fields: { VAR: s.target } }, { VALUE: exprIn(s.value) })
    case 'AugAssign':
      return withInputs({ type: 'py_augassign', fields: { VAR: s.target, OP: s.op } }, { VALUE: exprIn(s.value) })
    case 'SubscriptAssign':
      return withInputs(
        { type: 'py_subscript_assign' },
        { TARGET: exprIn(s.target), INDEX: exprIn(s.index), VALUE: exprIn(s.value) },
      )
    case 'ExprStmt':
      if (s.expr.kind === 'Call' && s.expr.func === 'print')
        return withInputs({ type: 'py_print', extraState: { count: s.expr.args.length } }, argInputs(s.expr.args))
      return withInputs({ type: 'py_expr_stmt' }, { EXPR: exprIn(s.expr) })
    case 'If': {
      const inputs: Record<string, BlockState | null> = {}
      s.branches.forEach((b, i) => {
        inputs['IF' + i] = exprIn(b.test)
        inputs['DO' + i] = stmtChain(b.body)
      })
      if (s.orelse) inputs.ELSE = stmtChain(s.orelse)
      return withInputs({ type: 'py_if', extraState: { elif: s.branches.length - 1, else: s.orelse !== null } }, inputs)
    }
    case 'While':
      return withInputs({ type: 'py_while' }, { COND: exprIn(s.test), DO: stmtChain(s.body) })
    case 'For':
      return withInputs({ type: 'py_for', fields: { VAR: s.target } }, { ITER: exprIn(s.iter), DO: stmtChain(s.body) })
    case 'FunctionDef':
      return withInputs({ type: 'py_def', fields: { NAME: s.name, PARAMS: s.params.join(', ') } }, { DO: stmtChain(s.body) })
    case 'Return':
      return withInputs({ type: 'py_return' }, { VALUE: s.value ? exprIn(s.value) : null })
    case 'Break':
      return { type: 'py_break' }
    case 'Continue':
      return { type: 'py_continue' }
    case 'Pass':
      return { type: 'py_pass' }
    case 'Raw':
      return { type: 'py_raw', extraState: { code: s.code, indent: s.indent, reason: s.reason, broken: s.broken } }
  }
}

function exprState(e: Expr): BlockState {
  switch (e.kind) {
    case 'Name':
      return { type: 'py_name', fields: { NAME: e.name } }
    case 'Num':
      return { type: 'py_num', fields: { NUM: e.value } }
    case 'Str':
      return { type: 'py_str', fields: { TEXT: e.value } }
    case 'Bool':
      return { type: 'py_bool', fields: { BOOL: e.value ? 'TRUE' : 'FALSE' } }
    case 'NoneConst':
    case 'Hole':
      return { type: 'py_none' }
    case 'BinOp':
      return withInputs({ type: 'py_binop', fields: { OP: e.op } }, { A: exprIn(e.left), B: exprIn(e.right) })
    case 'Compare':
      return withInputs({ type: 'py_compare', fields: { OP: e.op } }, { A: exprIn(e.left), B: exprIn(e.right) })
    case 'BoolOp':
      return withInputs({ type: 'py_boolop', fields: { OP: e.op } }, { A: exprIn(e.left), B: exprIn(e.right) })
    case 'Not':
      return withInputs({ type: 'py_not' }, { VALUE: exprIn(e.operand) })
    case 'Neg':
      return withInputs({ type: 'py_neg' }, { VALUE: exprIn(e.operand) })
    case 'Call':
      return withInputs({ type: 'py_call', fields: { FUNC: e.func }, extraState: { count: e.args.length } }, argInputs(e.args))
    case 'MethodCall':
      return withInputs(
        { type: 'py_method', fields: { METHOD: e.method }, extraState: { count: e.args.length } },
        { OBJ: exprIn(e.obj), ...argInputs(e.args) },
      )
    case 'List':
      return withInputs({ type: 'py_list', extraState: { count: e.items.length } }, argInputs(e.items))
    case 'Dict':
      return withInputs(
        { type: 'py_dict', extraState: { count: e.keys.length } },
        Object.fromEntries(e.keys.flatMap((k, i) => [['KEY' + i, exprIn(k)], ['ARG' + i, exprIn(e.values[i])]])),
      )
    case 'Subscript':
      return withInputs({ type: 'py_subscript' }, { VALUE: exprIn(e.value), INDEX: exprIn(e.index) })
  }
}
