---
name: สะพาน Python
description: Thai block-to-Python learning workspace built like the signage of a grand departure hall, where every line of code is a station and the whole hall takes the colour of the line you are riding.
colors:
  line-use: "#0b7a6b"
  line-modify: "#2346c8"
  line-create: "#6a3fc4"
  route-use: "#0f9d8a"
  route-create: "#7a4fd6"
  departure-gold: "#ffc727"
  departure-gold-hover: "#ffd552"
  departure-gold-wash: "#fff3c4"
  stop-red: "#d93a40"
  stop-red-ink: "#a3242a"
  stop-red-wash: "#fde8e9"
  caution-ochre: "#9a6a00"
  select-wash: "#e8eefc"
  hall-floor: "#ecebe6"
  rail-paper: "#f6f5f1"
  panel-white: "#ffffff"
  sign-black: "#111111"
  rule-hair: "#d6d4cc"
  ink-secondary: "#3a3935"
  ink-muted: "#6b6a63"
  ink-faint: "#9a988f"
  strip-ink: "#bdbdb6"
  console-seam: "#333333"
  console-ink: "#f2f2ee"
  block-variable: "#b0306a"
  block-io: "#2856c9"
  block-logic: "#8f5400"
  block-loop: "#1f7a4f"
  block-func: "#6a3fc4"
  block-math: "#4a4fc4"
  block-text: "#0e7266"
  block-data: "#a8481c"
typography:
  sign:
    fontFamily: "'Noto Sans Thai Variable', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.2
  headline:
    fontFamily: "'Noto Sans Thai Variable', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.15
  station:
    fontFamily: "'Noto Sans Thai Variable', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "'Noto Sans Thai Variable', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Noto Sans Thai Variable', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "34px"
  console:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  none: "0px"
  block: "3px"
  station: "50%"
spacing:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "22px"
  rule: "2px"
components:
  button-run:
    backgroundColor: "{colors.departure-gold}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.none}"
    padding: "0 30px"
  button-run-hover:
    backgroundColor: "{colors.departure-gold-hover}"
  button-stop:
    backgroundColor: "{colors.stop-red}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.none}"
    padding: "0 30px"
  button-outline:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 18px"
  panel-strip:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.none}"
    padding: "0 18px"
  stage-tag:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.line-modify}"
    rounded: "{rounded.none}"
    height: "28px"
    padding: "0 10px"
  category-tab:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 14px"
  category-tab-selected:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.panel-white}"
  console:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.console-ink}"
    rounded: "{rounded.none}"
  line-chip-error:
    backgroundColor: "{colors.stop-red}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.none}"
    padding: "0 8px"
---

# Design System: สะพาน Python

## Overview

**Creative North Star: "The Grand Departure Hall"**

The screen is the signage of a great railway hall, turned up loud on purpose. A full-width sign band runs across the top in the colour of the line you are riding. Hard black rules divide the floor into areas, and every area announces itself with a black strip and white letters. A single gold block says where to go next: run. Nothing floats and nothing is soft. Everything is fixed to the hall the way real signage is, and that is where the drama comes from.

The whole hall changes colour with the stage of the lesson. Use is deep teal, Modify is signal blue, Create is violet, and the change reaches the sign band, the stage tag, the station route in the code and every visited station. A learner always knows which stage they are in without reading anything. Inside that loud frame the working areas stay quiet and white, so code and blocks remain the easiest things on screen to read.

The look is intentionally bold and theatrical, but it never decorates. Every big gesture carries meaning: the colour is the stage, gold is "now", red is "stopped", and the thick route line is the program running.

**Key Characteristics:**
- A full-width stage-coloured sign band with a gold run block flush to the right edge.
- 2px black rules divide areas. There are no cards, no shadows and no rounded containers.
- Black panel strips with white condensed labels head every work area.
- Thick metro-map routes: 8px in the lesson rail and 6px in the code gutter, with 20–22px station rings.
- Condensed Thai display type for signs and headlines, and plain text for reading.

## Colors

The hall is neutral concrete and white, with one stage colour flooding the frame and a gold-and-red signal pair reserved for state.

### Primary (stage line colours)
- **Line Use** (#0b7a6b): the sign band, stage tag text, code route and visited stations during Use lessons.
- **Line Modify** (#2346c8): the same roles during Modify lessons.
- **Line Create** (#6a3fc4): the same roles during Create lessons.
- **Route Use** (#0f9d8a) and **Route Create** (#7a4fd6): the brighter versions used only for the lesson-rail map segments, where they sit on paper rather than under white text.

### Tertiary (signals)
- **Departure Gold** (#ffc727): the run block, the current lesson station, the station the program is at, echoed input and the input field border. Its hover is #ffd552 and its row wash is #fff3c4.
- **Stop Red** (#d93a40) with ink #a3242a and wash #fde8e9: the stop button while running, the station where a run failed, error underlines, error line chips and the failed-answer verdict.
- **Caution Ochre** (#9a6a00): validator warnings, shown dashed and outlined.

### Neutral
- **Hall Floor** (#ecebe6): the page behind everything.
- **Rail Paper** (#f6f5f1): the lesson rail.
- **Panel White** (#ffffff): every work area.
- **Sign Black** (#111111): rules, panel strips, the console, and primary ink.
- **Rule Hair** (#d6d4cc): secondary 1px dividers inside a panel, such as step rows and category tabs.
- **Ink Secondary** (#3a3935), **Ink Muted** (#6b6a63) and **Ink Faint** (#9a988f): body, quiet text and station numbers.
- **Strip Ink** (#bdbdb6), **Console Seam** (#333333) and **Console Ink** (#f2f2ee): labels and text on black.

### Block category colours
Variable #b0306a, IO #2856c9, Logic #8f5400, Loop #1f7a4f, Function #6a3fc4, Math #4a4fc4, Text #0e7266, Data #a8481c. Each appears as the block fill and as a square 10px swatch on its category tab.

### Named Rules
**The Whole-Hall Rule.** The current stage colour floods the sign band and the code route together. It is never a small accent.

**The Gold Means Go Rule.** Departure Gold marks only the run action and "where the program is now". Nothing decorative is gold.

**The Shape-Not-Hue Rule.** Errors and warnings differ in line form (solid versus dashed, filled versus outlined) as well as in colour.

## Typography

**Display and Body Font:** Noto Sans Thai Variable (with Noto Sans Thai, system-ui)
**Code Font:** JetBrains Mono (with ui-monospace)

**Character:** one Thai family across two widths. Condensed (75–90% width, weight 700–800) makes the sign voice of the band, strips, stations and headlines. Normal width makes the reading voice of instructions. JetBrains Mono is used only for code, output, line numbers and step numbers, with ligatures off.

### Hierarchy
- **Sign** (800, 20px, 75% width): the product name and the lesson title in the sign band.
- **Headline** (800, 26px, 75% width, 1.15): the lesson title on the task panel.
- **Station** (500, 16px, 90% width): lesson names on the route. The current lesson is 800.
- **Body** (400, 15px, 1.55): goals and step text.
- **Label** (700, 13px, 85% width): panel strips and stage heads (12px/800 in the rail).
- **Code** (400, 15px on a 34px line): the Python view. The 34px line is the station spacing.
- **Console** (400, 16px, 1.6): program output.

### Named Rules
**The No-Tracking-on-Thai Rule.** Thai is never letter-spaced or uppercased. Width and weight carry rank instead.

**The Literal Code Rule.** Code fonts render with ligatures off, so `>=` and `==` look exactly as the learner must type them.

## Layout

A full-viewport hall: the 64px sign band, then a three-column floor (300px rail, fluid blocks, 400–520px code and output) divided by 2px black rules, with no outer padding and no gaps. Code and output stack 1.2 : 1. Below 1100px the code and output move under the first two columns and the sign band sticks to the top. Below 720px everything stacks, the lesson crumb and replay hide, and the run block stays in the band. Panel strips are 44px. Content padding is 18px.

## Elevation & Depth

Flat by conviction. Depth comes from contrast and rules, never from shadows: the dark band above, black strips over white panels, and the black console as the one dark area. Station markers get emphasis from scale (×1.2) and colour, not glow.

### Named Rules
**The Bolted-Down Rule.** No element casts a shadow or floats. If something needs emphasis, give it a thicker rule, a black strip or a stage colour.

## Shapes

Square. Containers, buttons, tags, chips and inputs all have 0px corners. Blocks keep a 3px corner so they still read as blocks, and stations are the only circles: rings with a 5px border, filled when visited. Routes are solid bars with square ends.

## Components

### Buttons
- **Run:** a Departure Gold block flush to the right of the sign band, full band height, 30px padding and 18px/800 condensed text. Hover lightens to #ffd552. While a program runs, the same slot becomes a Stop Red "หยุด" block.
- **Replay:** a ghost cell in the band with a 2px translucent white left rule. Its hover darkens the band by 18%.
- **Outline:** 48px, a 2px black border with white fill. Hover inverts to black with white text. Adjacent outline buttons share a border and form one bar ("ตรวจคำตอบ | เริ่มใหม่").
- **Focus:** a 3px blue outline. In the band it is a gold outline inset by 4px.

### Chips
- **Stage tag:** a white rectangle in the sign band with text in the stage colour.
- **Category tab:** a 44px square tab with a 10px colour swatch, separated by 1px rules. It turns black when selected.
- **Line chip:** a square mono chip reading "บรรทัด n". Errors are filled red; warnings are outlined ochre.

### Cards / Containers
There are no cards. Areas are panels divided by 2px Sign Black rules, each headed by a black strip with a white condensed label.

### Inputs / Fields
- **Console input:** 40px, square, a 2px Departure Gold border on #1c1c1c, mono text, with a square gold "ส่ง" block beside it.

### Navigation
- **Lesson route:** a continuous 8px bar that changes colour per stage segment, with 22px station rings. Done stations are filled in the segment colour with a black ring, and the current station is gold with a black ring. Lesson names use the station type, and hovering underlines them.

### Station Route (signature)
The code gutter is an 86px route: a 6px bar in the current stage colour, a 20px ring per line, and the line number in faint mono. The station the program is at turns gold and its line gets a gold wash with semibold code. The station where it stopped turns red with a red wash. Visited stations fill with the stage colour. Selecting a block washes its lines blue and fades the rest to 45%.

### Error Lock
When the code has a syntax error, the block area greys out under a white notice with a red ring: "แก้โค้ดบรรทัด n ก่อน แล้วบล็อกจะตามมา". Blocks with validator or runtime problems get a 3px red outline (solid) or an ochre outline (dashed) and Blockly's warning icon.

## Do's and Don'ts

### Do:
- **Do** flood the sign band and the code route with the current stage colour (#0b7a6b, #2346c8, #6a3fc4).
- **Do** divide areas with 2px #111111 rules and head each with a black strip.
- **Do** keep every container, button and tag square (0px).
- **Do** reserve Departure Gold (#ffc727) for run and "now".
- **Do** use condensed Noto Sans Thai for sign text and normal width for reading.
- **Do** keep code ligatures off.

### Don't:
- **Don't** use soft pastel pill buttons or chips.
- **Don't** float white cards with soft shadows on a grey ground.
- **Don't** add glows or coloured shadows to buttons.
- **Don't** letter-space or uppercase Thai.
- **Don't** use gold, red or a stage colour as decoration.
