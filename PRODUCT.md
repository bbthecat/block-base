# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript + Vite, Blockly (block editor), CodeMirror 6 (code view), web-tree-sitter + tree-sitter-python (parser), Pyodide in a Web Worker (runtime), Vitest (round-trip tests). Fully client-side, no server, deployable to free static hosting (Vercel).

## Users

Primary: Thai first-year university students (Khon Kaen University) who are just starting Python and have little programming background; some saw Scratch or block coding in high school. They use it in a computer lab or on their own laptop during an introductory programming course, working through exercises. Confirmed by the user.

Secondary (inferred from the proposal, §8.3): instructors who prepare example programs for the Use and Modify stages. No dedicated instructor screen in the first round.

## Product Purpose

A block-based Python learning environment that eases the "cognitive transition barrier" from visual block programming to text-based Python. Blocks and Python code are two live views of one program, translated in both directions through an Abstract Syntax Tree. Learners follow the Use → Modify → Create progression.

Success (from the proposal, §5.7): learners rate ease of use, understanding of Python structure, ability to write basic programs, understanding of the block↔Python relationship, and satisfaction; measured by questionnaire with mean/SD.

## Positioning

Bidirectional block ⇄ Python translation through an AST shared by both views, so the learner sees *why* a block becomes a given line of code, not just that it does. Not AI code generation (explicitly out of scope, §6.2.3).

## Operating Context

Seminar project CP353761, Computer Science, College of Computing, KKU, academic year 2569 (Jun 2569 – May 2570). Advisor: อ.ธนพล ตั้งชูพงศ์. Will be demoed to the advisor and committee, then evaluated with a limited sample of beginner learners.

## Capabilities and Constraints

- Supported Python subset: variables and basic types, input/print, operators, if/elif/else, for/while, functions, list, dict.
- Not supported: classes, try/except, imports/external libraries; out-of-scope code triggers a warning instead of conversion.
- Validator: syntax errors, undefined variables, type mismatches between connected blocks, incomplete if/loop structures.
- One screen shows Block View, Python Code View, Output, and Error Message together.
- UI language: Thai; Python keywords and block text stay in real Python syntax.
- Budget: 3,000 THB total; no paid services.

## Evidence on Hand

Project proposal PDF (เค้าโครงโครงงาน, Oct 2569) with literature: Vidal-Silva et al. 2024, Park & Shin 2022, Kazemitabaar et al. 2023, Sun et al. 2023/2026. No user testing data yet; do not fabricate results.

## Product Principles

1. The program is one thing with two faces: every block maps visibly to its Python line and back.
2. Lower extraneous load: fewer simultaneous demands, plain Thai explanations, real Python on screen.
3. Scaffold, don't replace: Use and Modify come before Create; never write the learner's code for them.
4. Errors teach: explain what went wrong in Thai, point to the exact block and line.

## Accessibility & Inclusion

Thai text must render well (Thai-capable font, comfortable line height for tone marks). Lab machines may be modest laptops; keep it working offline-capable after first load.
