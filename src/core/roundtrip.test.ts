import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type Parser from 'web-tree-sitter'
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
  it('class', () => {
    const r = parsePython(parser, 'class A:\n    pass\n')
    expect(r.module).toBeNull()
    expect(r.diagnostics[0].message).toContain('คลาส')
  })
  it('syntax error', () => {
    const r = parsePython(parser, 'if x > 1\n    print(x)\n')
    expect(r.module).toBeNull()
    expect(r.diagnostics[0].severity).toBe('error')
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
