import { useId } from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import {
  Baby, Banknote, Bike, Bus, Car, Cat, Coffee, CreditCard, Dumbbell, Fuel, Gamepad2, Gift,
  GraduationCap, HeartPulse, House, Landmark, Laptop, Lightbulb, Luggage, Music, Package, PawPrint,
  Phone, PiggyBank, Pill, Plane, Receipt, Scissors, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone,
  Sofa, Sparkles, Tag, Train, Tv, Utensils, Wifi, Wrench, Droplets, Film, BookOpen, Briefcase, Wine,
  type LucideIcon,
} from 'lucide-react'

/** Glyphs a category can use. Keys are persisted, so only ever add to this list. */
export const categoryIcons = {
  food: Utensils,
  groceries: ShoppingCart,
  coffee: Coffee,
  drinks: Wine,
  transport: Bus,
  car: Car,
  fuel: Fuel,
  train: Train,
  bike: Bike,
  travel: Plane,
  luggage: Luggage,
  home: House,
  furniture: Sofa,
  repairs: Wrench,
  electricity: Lightbulb,
  water: Droplets,
  internet: Wifi,
  phone: Phone,
  mobile: Smartphone,
  bills: Receipt,
  subscriptions: Tv,
  movies: Film,
  music: Music,
  games: Gamepad2,
  shopping: ShoppingBag,
  clothing: Shirt,
  personal: Sparkles,
  grooming: Scissors,
  health: HeartPulse,
  medicine: Pill,
  fitness: Dumbbell,
  education: GraduationCap,
  books: BookOpen,
  work: Briefcase,
  tech: Laptop,
  kids: Baby,
  pets: PawPrint,
  cat: Cat,
  gifts: Gift,
  savings: PiggyBank,
  cash: Banknote,
  card: CreditCard,
  bank: Landmark,
  insurance: Shield,
  parcel: Package,
  other: Tag,
} satisfies Record<string, LucideIcon>

export type CategoryIconKey = keyof typeof categoryIcons

const labels: Record<string, string> = { tech: 'Tech', cat: 'Cat', bank: 'Bank', card: 'Card' }
const iconLabel = (key: string) => labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1)

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === 'string' && Object.hasOwn(categoryIcons, value)
}

type CategoryIconProps = { icon?: string | undefined; color: string; size?: number }

/** A category's glyph on a tinted tile, or a plain color dot while no icon is chosen. */
export function CategoryIcon({ icon, color, size = 16 }: CategoryIconProps) {
  if (!isCategoryIconKey(icon)) return <span className="category-color-chip" style={{ backgroundColor: color }} aria-hidden="true" />
  const Glyph = categoryIcons[icon]
  const tile = size + 12
  return (
    <span className="category-icon-tile" style={{ width: tile, height: tile, color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }} aria-hidden="true">
      <Glyph size={size} strokeWidth={2} />
    </span>
  )
}

type CategoryIconFieldProps<T extends FieldValues> = { control: Control<T>; name: FieldPath<T>; label?: string }

/** Grid of selectable category glyphs; picking the selected one again clears it. */
export function CategoryIconField<T extends FieldValues>({ control, name, label = 'Icon' }: CategoryIconFieldProps<T>) {
  const legendId = useId()
  return (
    <Controller control={control} name={name} render={({ field }) => (
      <fieldset className="category-icon-picker" aria-labelledby={legendId}>
        <legend id={legendId}>{label}</legend>
        <div className="category-icon-grid" role="radiogroup" aria-labelledby={legendId}>
          {(Object.keys(categoryIcons) as CategoryIconKey[]).map((key) => {
            const Glyph = categoryIcons[key]
            const selected = field.value === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={iconLabel(key)}
                title={iconLabel(key)}
                className="category-icon-option"
                onClick={() => field.onChange(selected ? '' : key)}>
                <Glyph size={20} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </fieldset>
    )} />
  )
}
