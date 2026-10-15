// อธิบาย error ของ Python เป็นภาษาไทยสำหรับมือใหม่
import type { RunError } from './runner'

export function explain(e: RunError): string {
  const m = e.message
  switch (e.type) {
    case 'NameError': {
      const name = m.match(/'(.+?)'/)?.[1]
      return `ใช้ชื่อ "${name}" ก่อนที่จะสร้าง ตรวจว่าสะกดถูก และกำหนดค่าให้ตัวแปรก่อนใช้แล้ว`
    }
    case 'TypeError':
      if (/can only concatenate str|unsupported operand type.*'str'|must be str, not int/.test(m))
        return 'นำข้อความกับตัวเลขมาคำนวณด้วยกันไม่ได้ ถ้าค่ามาจาก input() ให้ครอบด้วย int(...) ก่อน หรือแปลงตัวเลขเป็นข้อความด้วย str(...)'
      if (/not supported between instances of 'str' and 'int'|'int' and 'str'/.test(m))
        return 'เปรียบเทียบข้อความกับตัวเลขไม่ได้ ลองแปลงค่าจาก input() ด้วย int(...)'
      if (/takes \d+ positional argument|missing \d+ required positional argument/.test(m))
        return 'จำนวนค่าที่ส่งให้ฟังก์ชันไม่ตรงกับจำนวนพารามิเตอร์ที่ประกาศไว้'
      if (/object is not callable/.test(m)) return 'เรียกใช้สิ่งที่ไม่ใช่ฟังก์ชันเหมือนเป็นฟังก์ชัน อาจตั้งชื่อตัวแปรซ้ำกับชื่อฟังก์ชัน'
      return 'ชนิดข้อมูลไม่ตรงกับที่คำสั่งนี้ต้องการ'
    case 'ValueError':
      if (/invalid literal for int/.test(m)) return 'แปลงข้อความเป็นตัวเลขไม่ได้ เพราะข้อความที่พิมพ์ไม่ใช่ตัวเลข'
      return 'ค่าที่ส่งเข้ามาใช้กับคำสั่งนี้ไม่ได้'
    case 'ZeroDivisionError':
      return 'หารด้วยศูนย์ไม่ได้ ตรวจค่าตัวหารก่อนหาร'
    case 'IndexError':
      return 'เรียกตำแหน่งที่ไม่มีอยู่ในลิสต์ ตำแหน่งเริ่มที่ 0 และตำแหน่งสุดท้ายคือ len(...) - 1'
    case 'KeyError':
      return `ไม่มีคีย์ ${m} ในดิกชันนารี ลองตรวจด้วย in ก่อน หรือใช้ .get(...)`
    case 'AttributeError':
      return 'ข้อมูลชนิดนี้ไม่มีเมธอดที่เรียก ตรวจชื่อเมธอดและชนิดของข้อมูล'
    case 'SyntaxError':
    case 'IndentationError':
      return 'ไวยากรณ์ผิด เช่น ลืม : หลัง if/for/def หรือย่อหน้าไม่ตรงกัน'
    case 'RecursionError':
      return 'ฟังก์ชันเรียกตัวเองไม่รู้จบ ต้องมีเงื่อนไขให้หยุด'
    case 'EOFError':
      return 'โปรแกรมรอรับค่าจาก input() แต่ไม่มีข้อมูลให้'
    case 'Timeout':
      return 'โปรแกรมทำงานนานเกินไป อาจมีลูปที่ไม่มีวันจบ'
    case 'Stopped':
      return 'หยุดโปรแกรมแล้ว'
    default:
      return 'โปรแกรมหยุดทำงานเพราะเกิดข้อผิดพลาด'
  }
}
