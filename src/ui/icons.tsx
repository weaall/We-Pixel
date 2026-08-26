/**
 * 인라인 SVG 아이콘.
 *
 * 아이콘 라이브러리를 넣으면 번들이 커지고, 정작 쓰는 건 열몇 개다.
 * 모두 24x24 뷰박스에 currentColor 스트로크라 버튼 색을 그대로 따라간다.
 */

export interface IconProps {
  size?: number
}

function svg(path: React.ReactNode, size = 18) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

export const IconPen = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 19l7-7-4-4-7 7v4h4z" />
      <path d="M15 8l1-1a2 2 0 0 0-3-3l-1 1" />
    </>,
    size,
  )

export const IconEraser = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M8 20H5l-2-2a2 2 0 0 1 0-3l9-9 7 7-7 7z" />
      <path d="M9 11l7 7" />
    </>,
    size,
  )

export const IconFill = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M5 12l7-7 7 7-7 7z" />
      <path d="M19 15c1 1.5 1.5 2.5 1.5 3.2a1.5 1.5 0 1 1-3 0c0-.7.5-1.7 1.5-3.2z" />
    </>,
    size,
  )

export const IconLine = ({ size }: IconProps) => svg(<path d="M5 19L19 5" />, size)

export const IconRect = ({ size }: IconProps) =>
  svg(<rect x="4" y="6" width="16" height="12" rx="1" />, size)

export const IconRectFill = ({ size }: IconProps) =>
  svg(<rect x="4" y="6" width="16" height="12" rx="1" fill="currentColor" />, size)

export const IconPicker = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M18 3a2.4 2.4 0 0 1 3 3l-7 7-3-3 7-7z" />
      <path d="M11 10l-6 6v3h3l6-6" />
    </>,
    size,
  )

export const IconUndo = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10h-4" />
      <path d="M8 5L4 9l4 4" />
    </>,
    size,
  )

export const IconRedo = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M20 9H9a5 5 0 0 0 0 10h4" />
      <path d="M16 5l4 4-4 4" />
    </>,
    size,
  )

export const IconTrash = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>,
    size,
  )

export const IconGrid = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M9 4v16M15 4v16M4 9h16M4 15h16" />
    </>,
    size,
  )

export const IconMirrorX = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <path d="M9 7L4 12l5 5z" />
      <path d="M15 7l5 5-5 5z" />
    </>,
    size,
  )

export const IconMirrorY = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M3 12h18" strokeDasharray="3 3" />
      <path d="M7 9l5-5 5 5z" />
      <path d="M7 15l5 5 5-5z" />
    </>,
    size,
  )

export const IconBrush = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="15" r="5" />
    </>,
    size,
  )

export const IconSparkle = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M18 16l.7 1.8 1.8.7-1.8.7L18 21l-.7-1.8-1.8-.7 1.8-.7z" />
    </>,
    size,
  )

export const IconDice = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>,
    size,
  )

export const IconImage = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-6 6-2-2-5 4" />
    </>,
    size,
  )

export const IconFolder = ({ size }: IconProps) =>
  svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, size)

export const IconPackage = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>,
    size,
  )

export const IconResize = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M14 10h4v4" />
      <path d="M18 10l-8 8" />
    </>,
    size,
  )

export const IconClose = ({ size }: IconProps) => svg(<path d="M6 6l12 12M18 6L6 18" />, size)

export const IconPalette = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.8.7-1.3 1.5-1.3H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </>,
    size,
  )

export const IconRecolor = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M8 4l5 5-6 6-5-5z" />
      <path d="M6 6l7 7" />
      <path d="M18 13c1.4 2 2 3.3 2 4.3a2 2 0 1 1-4 0c0-1 .6-2.3 2-4.3z" fill="currentColor" />
    </>,
    size,
  )

export const IconSelect = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M3 8V5a2 2 0 0 1 2-2h3" strokeDasharray="0" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M12 3v0M3 12h0M12 21v0M21 12h0" />
    </>,
    size,
  )

export const IconCopy = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>,
    size,
  )

export const IconCut = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M8.1 15.9L19 4M15.9 15.9L5 4" />
    </>,
    size,
  )

export const IconPaste = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <rect x="13" y="11" width="8" height="8" rx="1" />
    </>,
    size,
  )
