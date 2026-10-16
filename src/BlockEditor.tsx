// พื้นที่ลากวางบล็อก (Blockly)
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as Blockly from 'blockly/core'
import * as Th from 'blockly/msg/th'
import { astToWorkspaceState, COLORS, registerBlocks, workspaceToAst } from './core/blocks'
import type { Module } from './core/ast'

Blockly.setLocale(Th as unknown as { [key: string]: string })
registerBlocks()

const num = (n: string) => ({ block: { type: 'py_num', fields: { NUM: n } } })
const str = (s: string) => ({ block: { type: 'py_str', fields: { TEXT: s } } })
const name = (n: string) => ({ block: { type: 'py_name', fields: { NAME: n } } })
const call = (f: string, args: object[] = []) => ({
  block: {
    type: 'py_call',
    fields: { FUNC: f },
    extraState: { count: args.length },
    inputs: Object.fromEntries(args.map((a, i) => ['ARG' + i, a])),
  },
})

const cat = (name: string, key: keyof typeof COLORS, contents: object[]) => ({
  kind: 'category',
  name,
  colour: COLORS[key],
  cssconfig: { row: 'blocklyTreeRow cat-' + key }, // ให้ CSS ทำปุ่มแคปซูลสีตามหมวด
  contents,
})
const b = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra })

const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    cat('ตัวแปร', 'variable', [
      b('py_assign', { inputs: { VALUE: num('0') } }),
      b('py_augassign', { fields: { VAR: 'x', OP: '+' }, inputs: { VALUE: num('1') } }),
      b('py_name'),
    ]),
    cat('รับ-แสดงผล', 'io', [
      b('py_print', { extraState: { count: 1 }, inputs: { ARG0: str('สวัสดี') } }),
      { kind: 'block', ...call('input', [str('พิมพ์ข้อความ: ')]).block },
      { kind: 'block', ...call('int', [call('input', [str('ตัวเลข: ')])]).block },
    ]),
    cat('ค่า', 'text', [b('py_num'), b('py_str'), b('py_bool'), b('py_none')]),
    cat('คำนวณ', 'math', [
      b('py_binop', { fields: { OP: '+' } }),
      b('py_binop', { fields: { OP: '%' } }),
      b('py_neg'),
      { kind: 'block', ...call('int').block },
      { kind: 'block', ...call('str').block },
      { kind: 'block', ...call('len').block },
    ]),
    cat('เงื่อนไข', 'logic', [
      b('py_if'),
      b('py_if', { extraState: { elif: 0, else: true } }),
      b('py_if', { extraState: { elif: 1, else: true } }),
      b('py_compare', { fields: { OP: '==' } }),
      b('py_boolop'),
      b('py_not'),
    ]),
    cat('วนซ้ำ', 'loop', [
      b('py_for', { inputs: { ITER: call('range', [num('5')]) } }),
      b('py_while'),
      b('py_break'),
      b('py_continue'),
      b('py_pass'),
    ]),
    cat('ฟังก์ชัน', 'func', [
      b('py_def', { fields: { NAME: 'my_function', PARAMS: 'x' } }),
      b('py_return'),
      b('py_expr_stmt', { inputs: { EXPR: call('my_function') } }),
      { kind: 'block', ...call('my_function').block },
    ]),
    cat('ลิสต์/ดิกชันนารี', 'data', [
      b('py_list', { extraState: { count: 3 }, inputs: { ARG0: num('1'), ARG1: num('2'), ARG2: num('3') } }),
      b('py_dict', { extraState: { count: 1 }, inputs: { KEY0: str('key'), ARG0: num('0') } }),
      b('py_subscript', { inputs: { VALUE: name('nums'), INDEX: num('0') } }),
      b('py_subscript_assign', { inputs: { TARGET: name('nums'), INDEX: num('0') } }),
      b('py_expr_stmt', {
        inputs: { EXPR: { block: { type: 'py_method', fields: { METHOD: 'append' }, extraState: { count: 1 }, inputs: { OBJ: name('nums') } } } },
      }),
      { kind: 'block', type: 'py_method', fields: { METHOD: 'split' }, extraState: { count: 0 } },
    ]),
  ],
}

// zelos ที่มุมเกือบเหลี่ยม ให้เข้ากับแบบป้ายสถานี (zelos ปกติโค้งแบบ Scratch)
class SignageConstants extends Blockly.zelos.ConstantProvider {
  constructor() {
    super()
    this.CORNER_RADIUS = 3
  }
}
class SignageRenderer extends Blockly.zelos.Renderer {
  protected override makeConstants_() {
    return new SignageConstants()
  }
}
if (!Blockly.registry.hasItem(Blockly.registry.Type.RENDERER, 'signage'))
  Blockly.blockRendering.register('signage', SignageRenderer)

const theme = Blockly.Theme.defineTheme('metro', {
  name: 'metro',
  base: Blockly.Themes.Classic,
  fontStyle: { family: '"JetBrains Mono", monospace', weight: '600', size: 13 },
  componentStyles: {
    workspaceBackgroundColour: 'transparent',
    toolboxBackgroundColour: '#fdfbf3',
    toolboxForegroundColour: '#3c4150',
    flyoutBackgroundColour: '#f4efe1',
    flyoutOpacity: 0.97,
    scrollbarColour: '#c3c8d2',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#111111',
    insertionMarkerOpacity: 0.35,
    selectedGlowColour: '#ffc727',
    cursorColour: '#111111',
  },
})

export type BlockEditorHandle = {
  load(mod: Module): void
  toAst(): Module
  select(id: string | null): void
  highlight(id: string | null): void
  parentStatementIds(id: string): string[]
  mark(marks: Map<string, { severity: 'error' | 'warning'; text: string }>): void
}

type Props = {
  onChange(): void
  onSelect(id: string | null): void
}

export const BlockEditor = forwardRef<BlockEditorHandle, Props>(function BlockEditor({ onChange, onSelect }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const ws = useRef<Blockly.WorkspaceSvg | null>(null)
  const cb = useRef({ onChange, onSelect })
  cb.current = { onChange, onSelect }

  useEffect(() => {
    const narrow = window.innerWidth <= 720
    const w = Blockly.inject(host.current!, {
      horizontalLayout: narrow, // จอกว้าง: กล่องบล็อกเรียงแนวตั้งด้านซ้าย
      toolbox: TOOLBOX,
      renderer: 'signage',
      theme,
      media: './blockly-media/',
      trashcan: true,
      sounds: false,
      grid: { spacing: 24, length: 2, colour: '#d8ccb0', snap: false },
      zoom: { controls: true, wheel: false, startScale: narrow ? 0.62 : 0.82, maxScale: 1.6, minScale: 0.4, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true },
    })
    w.addChangeListener((e) => {
      if (e.type === Blockly.Events.SELECTED) cb.current.onSelect((e as Blockly.Events.Selected).newElementId ?? null)
      else if (!e.isUiEvent && e.type !== Blockly.Events.FINISHED_LOADING) cb.current.onChange()
    })
    ws.current = w
    const ro = new ResizeObserver(() => Blockly.svgResize(w))
    ro.observe(host.current!)
    return () => {
      ro.disconnect()
      w.dispose()
    }
  }, [])

  useImperativeHandle(ref, () => ({
    load(mod) {
      const w = ws.current!
      Blockly.Events.disable()
      try {
        w.clear()
        Blockly.serialization.workspaces.load(astToWorkspaceState(mod), w)
      } finally {
        Blockly.Events.enable()
      }
    },
    toAst: () => workspaceToAst(ws.current!),
    select(id) {
      const w = ws.current!
      const block = id ? w.getBlockById(id) : null
      if (block) block.select()
      else Blockly.common.setSelected(null)
    },
    highlight(id) {
      ws.current!.highlightBlock(id)
    },
    // id ของบล็อกนี้และบล็อกแม่ทั้งหมด เพื่อหาบล็อกคำสั่งที่ครอบบล็อกค่าอยู่
    parentStatementIds(id) {
      const out: string[] = []
      for (let blk = ws.current!.getBlockById(id); blk; blk = blk.getParent()) out.push(blk.id)
      return out
    },
    // ทำเครื่องหมายบล็อกที่มีปัญหา: error เส้นทึบ, warning เส้นประ (CSS) + ไอคอนเตือนของ Blockly
    mark(marks) {
      Blockly.Events.disable()
      try {
        for (const b of ws.current!.getAllBlocks(false)) {
          const m = marks.get(b.id)
          b.setWarningText(m ? m.text : null)
          b.getSvgRoot().classList.toggle('mark-error', m?.severity === 'error')
          b.getSvgRoot().classList.toggle('mark-warning', m?.severity === 'warning')
        }
      } finally {
        Blockly.Events.enable()
      }
    },
  }))

  return <div className="blockly-host" ref={host} />
})
