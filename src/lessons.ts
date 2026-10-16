// ชุดกิจกรรม Use-Modify-Create
export type Stage = 'use' | 'modify' | 'create'

export type Lesson = {
  id: string
  stage: Stage
  title: string
  goal: string
  steps: string[]
  starter: string
  /** ตรวจทีละกรณี: ป้อน stdin (และต่อท้ายโค้ดด้วย extra ถ้ามี) แล้วดูว่าผลลัพธ์ลงท้ายด้วย expected */
  tests?: { stdin: string[]; expected: string; extra?: string }[]
}

export const STAGE_LABEL: Record<Stage, { th: string; en: string; hint: string }> = {
  use: { th: 'ลองใช้', en: 'Use', hint: 'รันโปรแกรมที่มีให้ แล้วสังเกตว่าบล็อกกับโค้ดตรงกันอย่างไร' },
  modify: { th: 'ปรับแก้', en: 'Modify', hint: 'แก้บางส่วนของโปรแกรมที่ทำงานได้อยู่แล้ว ให้ได้ผลลัพธ์ตามโจทย์' },
  create: { th: 'สร้างเอง', en: 'Create', hint: 'เขียนโปรแกรมเองตั้งแต่ต้น จะใช้บล็อกหรือพิมพ์โค้ดก็ได้' },
}

export const LESSONS: Lesson[] = [
  {
    id: 'greet',
    stage: 'use',
    title: 'ทักทายด้วยชื่อ',
    goal: 'เห็นว่า input() รับข้อความ แล้ว print() แสดงผล',
    steps: [
      'กด "รัน" แล้วพิมพ์ชื่อของคุณในช่องที่โผล่ขึ้นมา',
      'คลิกบล็อก print ดูว่าโค้ดบรรทัดไหนสว่างขึ้น',
      'ลองคลิกที่บรรทัดโค้ด แล้วดูว่าบล็อกไหนถูกเลือก',
    ],
    starter: 'name = input("คุณชื่ออะไร: ")\nprint("สวัสดี " + name)\n',
  },
  {
    id: 'grade',
    stage: 'use',
    title: 'ตัดเกรดจากคะแนน',
    goal: 'เข้าใจ if / elif / else และการแปลง input เป็นตัวเลขด้วย int()',
    steps: [
      'รันโปรแกรมหลาย ๆ ครั้งด้วยคะแนนต่างกัน เช่น 85, 72, 40',
      'สังเกตว่าบล็อก if มีช่อง elif กี่ช่อง เทียบกับในโค้ด',
      'ลองเอา int(...) ออกจากโค้ด แล้วดูว่าระบบเตือนอะไร',
    ],
    starter:
      'score = int(input("คะแนน: "))\nif score >= 80:\n    print("A")\nelif score >= 70:\n    print("B")\nelif score >= 60:\n    print("C")\nelse:\n    print("F")\n',
  },
  {
    id: 'countdown',
    stage: 'use',
    title: 'นับถอยหลังออกเดินทาง',
    goal: 'เห็นว่า while วนซ้ำตราบที่เงื่อนไขยังจริง และต้องเปลี่ยนค่าตัวแปรเพื่อให้ลูปจบ',
    steps: [
      'รันแล้วใส่เลข 5 ดูว่าพิมพ์อะไรออกมาบ้าง',
      'กด "ทวนเส้นทาง" ดูว่าขบวนวนกลับไปที่บรรทัด while กี่รอบ',
      'ลองลบบล็อก n -= 1 ออก แล้วคิดว่าทำไมโปรแกรมไม่จบ (กด "หยุด" ได้)',
    ],
    starter: 'n = int(input("เริ่มนับจาก: "))\nwhile n > 0:\n    print(n)\n    n -= 1\nprint("ออกเดินทาง!")\n',
  },
  {
    id: 'sum',
    stage: 'modify',
    title: 'ผลรวมเลขคู่',
    goal: 'ปรับลูปให้รวมเฉพาะเลขคู่ตั้งแต่ 1 ถึง 100',
    steps: [
      'โปรแกรมนี้รวมเลข 1 ถึง 10 อยู่ ลองรันดูก่อน',
      'แก้ช่วงของ range ให้ไปถึง 100',
      'เพิ่มบล็อก if ในลูป ให้บวกเฉพาะตอน i % 2 == 0',
      'คำตอบที่ถูกคือ 2550',
    ],
    starter: 'total = 0\nfor i in range(1, 11):\n    total += i\nprint(total)\n',
    tests: [{ stdin: [], expected: '2550' }],
  },
  {
    id: 'max',
    stage: 'modify',
    title: 'หาค่าน้อยที่สุดในลิสต์',
    goal: 'ฟังก์ชันนี้หาค่ามากที่สุด ปรับให้หาค่าน้อยที่สุดแทน',
    steps: [
      'อ่านฟังก์ชัน biggest ทั้งในบล็อกและในโค้ด',
      'เปลี่ยนเครื่องหมายเปรียบเทียบให้หาค่าน้อยที่สุด',
      'เปลี่ยนชื่อฟังก์ชันเป็น smallest ทั้งที่ประกาศและที่เรียกใช้',
      'คำตอบที่ถูกคือ 3',
    ],
    starter:
      'def biggest(nums):\n    best = nums[0]\n    for n in nums:\n        if n > best:\n            best = n\n    return best\n\nscores = [12, 45, 3, 27]\nprint(biggest(scores))\n',
    tests: [
      { stdin: [], expected: '3' },
      { stdin: [], expected: '-4', extra: 'print(smallest([8, -4, 0]))' },
    ],
  },
  {
    id: 'passed',
    stage: 'modify',
    title: 'คัดคะแนนที่สอบผ่าน',
    goal: 'ตอนนี้โปรแกรมเก็บทุกคะแนนลงลิสต์ ปรับให้เก็บเฉพาะคะแนนตั้งแต่ 50 ขึ้นไป',
    steps: [
      'รันดูก่อน ลิสต์ passed ได้ทุกคะแนน',
      'ครอบบล็อก passed.append(s) ด้วยบล็อก if',
      'ตั้งเงื่อนไขเป็น s >= 50',
      'คำตอบที่ถูกคือ [72, 90, 61]',
    ],
    starter: 'scores = [45, 72, 38, 90, 61]\npassed = []\nfor s in scores:\n    passed.append(s)\nprint(passed)\n',
    tests: [{ stdin: [], expected: '[72, 90, 61]' }],
  },
  {
    id: 'fizzbuzz',
    stage: 'create',
    title: 'FizzBuzz',
    goal: 'พิมพ์เลข 1–15 แต่ถ้าหารด้วย 3 ลงตัวให้พิมพ์ Fizz หาร 5 ลงตัวพิมพ์ Buzz หารทั้งคู่ลงตัวพิมพ์ FizzBuzz',
    steps: [
      'เริ่มจากลูป for i in range(1, 16)',
      'ใช้ % เพื่อตรวจการหารลงตัว',
      'คิดดูว่าควรตรวจเงื่อนไขไหนก่อน',
    ],
    starter: 'for i in range(1, 16):\n    print(i)\n',
    tests: [
      {
        stdin: [],
        expected: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz',
      },
    ],
  },
  {
    id: 'count',
    stage: 'create',
    title: 'นับคำในประโยค',
    goal: 'รับประโยคหนึ่งบรรทัด แล้วนับว่าแต่ละคำเกิดขึ้นกี่ครั้งด้วยดิกชันนารี',
    steps: [
      'ใช้ .split() เพื่อแยกประโยคเป็นลิสต์ของคำ',
      'สร้างดิกชันนารีว่าง {} แล้วนับทีละคำ',
      "ทดสอบด้วยประโยค: a b a c b a → ต้องได้ {'a': 3, 'b': 2, 'c': 1}",
    ],
    starter: 'words = input("ประโยค: ").split()\ncounts = {}\nprint(counts)\n',
    tests: [
      { stdin: ['a b a c b a'], expected: "{'a': 3, 'b': 2, 'c': 1}" },
      { stdin: ['ไป มา ไป'], expected: "{'ไป': 2, 'มา': 1}" },
    ],
  },
  {
    id: 'average',
    stage: 'create',
    title: 'ฟังก์ชันหาค่าเฉลี่ย',
    goal: 'เขียนฟังก์ชัน average(nums) ที่คืนค่าเฉลี่ยของตัวเลขในลิสต์',
    steps: [
      'เติมช่องว่างหลัง return ให้เป็นสูตรค่าเฉลี่ย',
      'ใช้ sum(nums) หาผลรวม และ len(nums) นับจำนวน',
      'average([70, 80, 90]) ต้องได้ 80.0',
    ],
    starter: 'def average(nums):\n    return ___\n\nprint(average([70, 80, 90]))\n',
    tests: [
      { stdin: [], expected: '80.0' },
      { stdin: [], expected: '1.5', extra: 'print(average([1, 2]))' },
    ],
  },  // ไม่มี tests จึงไม่มีปุ่มตรวจคำตอบ ผู้เรียนลองเขียนอะไรก็ได้
  {
    id: 'sandbox',
    stage: 'create',
    title: 'สนามทดลอง (เล่นอิสระ)',
    goal: 'ลองต่อบล็อกหรือพิมพ์โค้ดอะไรก็ได้ ไม่มีโจทย์ให้ตรวจ',
    steps: [
      'ลากบล็อกจากแถบด้านซ้าย หรือพิมพ์โค้ดในช่อง Python',
      'กด "รัน" เพื่อดูผลลัพธ์',
      'โค้ดถูกบันทึกอัตโนมัติ กลับมาเล่นต่อได้',
    ],
    starter: '',
  },
]
