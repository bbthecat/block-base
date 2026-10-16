import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type Parser from 'web-tree-sitter'
import { describe as describeStmt } from './describe'
import { generate } from './generate'
import { initParser, parsePython } from './parse'
import { validate } from './validate'
import { LESSONS } from '../lessons'

let parser: Parser
beforeAll(async () => {
  parser = await initParser({ language: new Uint8Array(readFileSync('public/tree-sitter-python.wasm')) })
})

const roundtrip = (code: string) => {
  const r = parsePython(parser, code)
  expect(r.diagnostics).toEqual([])
  return generate(r.module!)
}

describe('round-trip โค้ด → AST → โค้ด', () => {
  const cases = [
    'x = 1\n',
    'name = input("ชื่อ: ")\nprint("สวัสดี " + name)\n',
    'if a > 1:\n    print(a)\nelif a == 1:\n    pass\nelse:\n    print(-a)\n',
    'total = 0\nfor i in range(1, 11):\n    total += i\nprint(total)\n',
    'while not done and n < 10:\n    n = n * 2\n    if n > 5:\n        break\n',
    'def add(a, b):\n    return a + b\n\nprint(add(1, 2))\n',
    'nums = [1, 2, 3]\nnums.append(4)\nnums[0] = 9\nprint(nums[0], len(nums))\n',
    'd = {"a": 1, "b": 2}\nprint(d["a"])\n',
    'x = (a + b) * c\ny = a + b * c\nz = 2 ** 3 ** 2\nw = (2 ** 3) ** 2\nv = a - (b - c)\n',
    'print("line\\nbreak", True, None)\n',
    'if x not in nums:\n    print(x)\n',
  ]
  for (const c of cases) it(JSON.stringify(c.split('\n')[0]), () => expect(roundtrip(c)).toBe(c))

  it('ตัดวงเล็บที่ไม่จำเป็นออกตาม AST', () => {
    expect(roundtrip('x = ((a + b))\n')).toBe('x = a + b\n')
  })

  it('โค้ดที่สร้างแล้วแปลงซ้ำได้ผลเดิม (idempotent)', () => {
    for (const c of cases) expect(roundtrip(roundtrip(c))).toBe(roundtrip(c))
  })
})

describe('แจ้งเตือนโครงสร้างนอกขอบเขต / syntax error', () => {
  it('class กลายเป็นบล็อกโค้ด ส่วนอื่นยังเป็นบล็อกปกติ', () => {
    const code = 'x = 1\nclass A:\n    pass\nprint(x)\n'
    const r = parsePython(parser, code)
    expect(r.module!.body.map((s) => s.kind)).toEqual(['Assign', 'Raw', 'ExprStmt'])
    expect(generate(r.module!)).toBe(code)
    expect(validate(r.module!)[0]).toMatchObject({ severity: 'warning', line: 2 })
    expect(validate(r.module!)[0].message).toContain('คลาส')
  })
  it('import ซ้อนใน if คงย่อหน้าเดิม และชื่อที่ import ไม่ถูกเตือนว่ายังไม่กำหนด', () => {
    const code = 'if True:\n    try:\n        import math\n    except:\n        pass\n    print(math.sqrt(16))\n'
    const r = parsePython(parser, code)
    expect(generate(r.module!)).toBe(code)
    expect(validate(r.module!).filter((d) => d.severity === 'error')).toEqual([])
  })
  it('syntax error: ส่วนที่ถูกยังเป็นบล็อก ส่วนที่ผิดเป็นบล็อกโค้ดสีแดง', () => {
    const code = 'x = 1\ndef f(a):\n    return a +\nprint(x)\n'
    const r = parsePython(parser, code)
    const [a, bad, c] = r.module!.body
    expect([a.kind, bad.kind, c.kind]).toEqual(['Assign', 'Raw', 'ExprStmt'])
    expect(bad).toMatchObject({ broken: true, code: 'def f(a):\n    return a +' })
    expect(generate(r.module!)).toBe(code)
    expect(validate(r.module!)).toMatchObject([{ severity: 'error', line: 2 }])
  })
  it('syntax error ข้างใน for: ตัว for ยังเป็นบล็อก', () => {
    const r = parsePython(parser, 'for i in range(3):\n    print(i +)\n')
    const loop = r.module!.body[0]
    expect(loop.kind).toBe('For')
    expect(loop.kind === 'For' && loop.body[0]).toMatchObject({ kind: 'Raw', broken: true })
  })
  it('บรรทัดที่ถูกกลืนเข้าโค้ดผิดคงย่อหน้าเดิมเมื่อสร้างโค้ดใหม่', () => {
    const code = 'x = 1\nfor i in range(3):\n    print(i\ny = 2\n'
    expect(generate(parsePython(parser, code).module!)).toBe(code)
  })
  it('คำสงวนที่ Tree-sitter อ่านเป็นชื่อตัวแปร ถือว่าไวยากรณ์ผิด', () => {
    const r = parsePython(parser, 'while True:\n    x = \n    break\n')
    const loop = r.module!.body[0]
    expect(loop.kind === 'While' && loop.body[0]).toMatchObject({ kind: 'Raw', broken: true })
    expect(validate(r.module!)[0].message).toContain('คำสงวน')
  })
})

describe('validator', () => {
  const diag = (code: string) => validate(parsePython(parser, code).module!).map((d) => d.message)
  it('ตัวแปรยังไม่กำหนด', () => expect(diag('print(y)\n')[0]).toContain('"y"'))
  it('input + ตัวเลข', () => expect(diag('a = input()\nprint(a + 1)\n')[0]).toContain('int('))
  it('ช่องว่าง', () => expect(diag('x = ___\n')[0]).toContain('ช่องว่าง'))
  it('break นอกลูป', () => expect(diag('break\n')[0]).toContain('ลูป'))
  it('โปรแกรมถูกต้องไม่มีคำเตือน', () => expect(diag('a = int(input())\nprint(a + 1)\n')).toEqual([]))
})

describe('บทเรียนทุกบทแปลงได้และไม่มี error', () => {
  for (const l of LESSONS)
    it(l.title, () => {
      const r = parsePython(parser, l.starter)
      expect(r.diagnostics).toEqual([])
      // บท Create ตั้งใจเว้นช่องว่างให้ผู้เรียนเติม
      const isHole = (m: string) => l.stage === 'create' && m.includes('ช่องว่าง')
      expect(validate(r.module!).filter((d) => d.severity === 'error' && !isHole(d.message))).toEqual([])
    })
})

describe('คำอธิบายภาษาไทยของแต่ละบรรทัด', () => {
  const say = (code: string) => describeStmt(parsePython(parser, code).module!.body[0])
  it('input', () => expect(say('name = input("ชื่อ: ")\n')).toBe('เก็บข้อความที่ผู้ใช้พิมพ์ไว้ในตัวแปร name'))
  it('int(input())', () => expect(say('n = int(input())\n')).toBe('เก็บตัวเลขที่ผู้ใช้พิมพ์ไว้ในตัวแปร n'))
  it('print', () => expect(say('print("สวัสดี " + name)\n')).toBe('แสดง “"สวัสดี " + name” ออกทางหน้าจอ'))
  it('range(1, 11)', () => expect(say('for i in range(1, 11):\n    pass\n')).toContain('10 รอบ โดย i มีค่าตั้งแต่ 1 ถึง 10'))
  it('if/elif/else', () => expect(say('if a > 1:\n    pass\nelif a:\n    pass\nelse:\n    pass\n')).toContain('elif ถัดไป ถ้าไม่จริงสักข้อทำส่วน else'))
  it('+=', () => expect(say('total += i\n')).toBe('เพิ่มค่าตัวแปร total ขึ้นอีก “i”'))
})
