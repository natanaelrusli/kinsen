import { Icon as AstryxIcon, type IconRegistry } from '@astryxdesign/core/Icon'
import { createElement, type SVGProps } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, CalendarDays,
  ChartNoAxesColumnIncreasing, Check, CheckCheck, ChevronDown, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, CircleCheck,
  Clock, Columns3, Contrast, Copy, Ellipsis, ExternalLink,
  EyeOff, FileText, Funnel, House, Info, Landmark, Menu, Mic, Pencil,
  Plus, ReceiptText, Search, Settings, Square, Trash2, TriangleAlert,
  Wallet, Wrench, X, type LucideIcon,
} from 'lucide-react'

const glyphs = {
  overview: House,
  calendar: CalendarDays,
  commitments: FileText,
  activity: ChartNoAxesColumnIncreasing,
  assets: Landmark,
  wallet: Wallet,
  settings: Settings,
  plus: Plus,
  arrow: ArrowRight,
  chevron: ChevronRight,
  check: Check,
  warning: TriangleAlert,
  edit: Pencil,
  trash: Trash2,
  close: X,
  clock: Clock,
  receipt: ReceiptText,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  external: ExternalLink,
  search: Search,
  appearance: Contrast,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof glyphs

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number }

// Theme overrides also migrate glyphs rendered internally by Astryx controls.
const semanticGlyphs = {
  close: X,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronsLeft: ChevronsLeft,
  chevronsRight: ChevronsRight,
  check: Check,
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  calendar: CalendarDays,
  clock: Clock,
  externalLink: ExternalLink,
  menu: Menu,
  moreHorizontal: Ellipsis,
  search: Search,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowsUpDown: ArrowUpDown,
  funnel: Funnel,
  eyeSlash: EyeOff,
  viewColumns: Columns3,
  copy: Copy,
  checkDouble: CheckCheck,
  wrench: Wrench,
  stop: Square,
  microphone: Mic,
  'numberInput:stepperDown': ChevronDown,
} satisfies Record<keyof IconRegistry | 'numberInput:stepperDown', LucideIcon>

export const lucideThemeIcons = Object.fromEntries(
  Object.entries(semanticGlyphs).map(([name, Glyph]) => [
    name, createElement(Glyph, { 'aria-hidden': true, focusable: false, width: '1em', height: '1em' }),
  ]),
)

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
