// มุมมองโค้ด Python (CodeMirror) ที่ใช้เส้นทางรถไฟแทนเลขบรรทัด
import { useEffect, useRef } from 'react'
import { python } from '@codemirror/lang-python'
import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, gutter, keymap, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export type LineState = {
  now: number | null // สถานีที่ขบวนรถอยู่
  visited: Set<number>
  stopped: number | null // บรรทัดที่เกิด error ตอนรัน
  selected: [number, number] | null // ช่วงบรรทัดของบล็อกที่เลือก
  changed: Set<number>
  diags: Map<number, 'error' | 'warning'>
}

export const emptyLineState = (): LineState => ({
  now: null,
  visited: new Set(),
  stopped: null,
  selected: null,
  changed: new Set(),
  diags: new Map(),
})

const programmatic = Annotation.define<boolean>()
const setLines = StateEffect.define<LineState>()
const linesField = StateField.define<LineState>({
  create: emptyLineState,
  update: (v, tr) => tr.effects.find((e) => e.is(setLines))?.value ?? v,
})

class Station extends GutterMarker {
  cls: string
  n: number
  constructor(cls: string, n: number) {
    super()
    this.cls = cls
    this.n = n
  }
  eq(o: Station) {
    return o.cls === this.cls && o.n === this.n
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'station ' + this.cls
    el.innerHTML = `<i></i><em>${this.n}</em>`
    return el
  }
}

const stationGutter = gutter({
  class: 'route-gutter',
  lineMarker(view, block) {
    const s = view.state.field(linesField)
    const line = view.state.doc.lineAt(block.from)
    const n = line.number
    if (n === view.state.doc.lines && !line.text.trim()) return null // บรรทัดว่างท้ายไฟล์ไม่ใช่สถานี
    const cls = [
      s.stopped === n ? 'stopped' : s.now === n ? 'now' : s.visited.has(n) ? 'visited' : '',
      s.diags.get(n) ?? '',
    ].join(' ')
    return new Station(cls, n)
  },
  lineMarkerChange: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(setLines))),
  initialSpacer: () => new Station('', 99),
})

const lineDecos = EditorView.decorations.compute([linesField, 'doc'], (state): DecorationSet => {
  const s = state.field(linesField)
  const b = new RangeSetBuilder<Decoration>()
  for (let n = 1; n <= state.doc.lines; n++) {
    const cls: string[] = []
    if (s.stopped === n) cls.push('ln-stopped')
    else if (s.now === n) cls.push('ln-now')
    if (s.changed.has(n)) cls.push('ln-changed')
    if (s.selected) cls.push(n >= s.selected[0] && n <= s.selected[1] ? 'ln-selected' : 'ln-dim')
    const d = s.diags.get(n)
    if (d) cls.push('ln-' + d)
    const line = state.doc.line(n)
    // เส้นนำย่อหน้า: ระดับการซ้อนของบล็อก = จำนวนช่องย่อหน้าละ 4 ช่อง
    const ind = Math.floor((line.text.match(/^ */)?.[0].length ?? 0) / 4)
    if (cls.length || ind)
      b.add(line.from, line.from, Decoration.line({ class: cls.join(' '), attributes: ind ? { style: `--ind:${ind}` } : {} }))
  }
  return b.finish()
})

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.operatorKeyword], color: 'var(--modify)', fontWeight: '600' },
  { tag: [t.string], color: 'var(--use-ink)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--red-ink)' },
  { tag: [t.comment], color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#6a3fc4' },
])

type Props = {
  code: string
  lines: LineState
  onEdit(code: string): void
  onCursorLine(line: number): void
  onFocus(): void
}

export function CodeView({ code, lines, onEdit, onCursorLine, onFocus }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cb = useRef({ onEdit, onCursorLine, onFocus })
  cb.current = { onEdit, onCursorLine, onFocus }

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          indentUnit.of('    '),
          indentOnInput(),
          bracketMatching(),
          python(),
          syntaxHighlighting(highlight),
          linesField,
          stationGutter,
          lineDecos,
          EditorView.contentAttributes.of({ 'aria-label': 'โค้ด Python', spellcheck: 'false' }),
          EditorView.updateListener.of((u) => {
            const user = u.transactions.some((tr) => !tr.annotation(programmatic))
            if (u.docChanged && user) cb.current.onEdit(u.state.doc.toString())
            if (u.selectionSet && user && u.view.hasFocus)
              cb.current.onCursorLine(u.state.doc.lineAt(u.state.selection.main.head).number)
            if (u.focusChanged && u.view.hasFocus) cb.current.onFocus()
          }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
    // สร้าง editor ครั้งเดียว ค่า code ที่เปลี่ยนภายหลังส่งผ่าน effect ด้านล่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const v = view.current!
    const cur = v.state.doc.toString()
    if (cur !== code)
      v.dispatch({ changes: { from: 0, to: cur.length, insert: code }, annotations: programmatic.of(true) })
  }, [code])

  useEffect(() => {
    view.current!.dispatch({ effects: setLines.of(lines), annotations: programmatic.of(true) })
  }, [lines])

  return <div className="code-host" ref={host} />
}
