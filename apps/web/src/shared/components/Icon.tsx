import { Icon as AstryxIcon, type IconType } from '@astryxdesign/core/Icon'
import type { ReactNode, SVGProps } from 'react'

export type IconName = 'overview' | 'calendar' | 'commitments' | 'activity' | 'assets' | 'wallet' | 'settings' | 'plus' | 'arrow' | 'chevron' | 'check' | 'warning' | 'edit' | 'trash' | 'close' | 'clock' | 'receipt' | 'arrow-left' | 'arrow-right' | 'external'

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number }

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const paths: Record<IconName, ReactNode> = {
  overview: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /><path d="M8 10h8" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>,
  commitments: <><path d="M8 3h8l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M16 3v5h4M8 12h8M8 16h5" /></>,
  activity: <><path d="M4 18V6m5 12V9m5 9V4m5 14v-6" /><path d="M2 21h20" /></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 8h18M15 14h2" /></>,
  assets: <><path d="M3 7h18M3 12h18M3 17h18" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="9" cy="17" r="2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.5 7.5 0 0 0 0-2l1.3-1-1.7-3-1.6.7a7.5 7.5 0 0 0-1.7-1L13.4 4h-2.8l-.3 1.7a7.5 7.5 0 0 0-1.7 1L7 6l-1.7 3 1.3 1a7.5 7.5 0 0 0 0 2l-1.3 1 1.7 3 1.6-.7a7.5 7.5 0 0 0 1.7 1l.3 1.7h2.8l.3-1.7a7.5 7.5 0 0 0 1.7-1l1.6.7 1.7-3z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  warning: <><path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
  edit: <><path d="m15 5 4 4" /><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /></>,
  trash: <><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  'arrow-left': <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  external: <><path d="M14 4h6v6m0-6-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
}

function createGlyph(name: IconName): IconType {
  return (props) => <svg viewBox="0 0 24 24" focusable="false" {...common} {...props}>{paths[name]}</svg>
}

const glyphs = Object.fromEntries(
  (Object.keys(paths) as IconName[]).map((name) => [name, createGlyph(name)]),
) as Record<IconName, IconType>

export function Icon({ name, size = 20, width, height, color, style, ...props }: IconProps) {
  return (
    <AstryxIcon
      icon={glyphs[name]}
      size="md"
      style={{ width: width ?? size, height: height ?? size, color, ...style }}
      {...props}
    />
  )
}
