// ไอคอนเส้นชุดเดียว (stroke 1.8) วาดเอง
const PATHS = {
  route: 'M6 3v18M6 7.5a1.5 1.5 0 1 0 0-.01M6 16.5a1.5 1.5 0 1 0 0-.01M11 7h9M11 12h6M11 17h8',
  play: 'M8 5.5v13l11-6.5z',
  stop: 'M7 7h10v10H7z',
  replay: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
} as const

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
