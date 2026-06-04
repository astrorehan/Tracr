import { Circle, type LucideProps } from 'lucide-react'
import { ICON_MAP } from './icons'

/** Render a category's icon by its stored name, falling back to a neutral circle. */
export function CategoryIcon({
  name,
  ...props
}: { name?: string | null } & Omit<LucideProps, 'name'>) {
  const Icon = (name ? ICON_MAP[name] : undefined) ?? Circle
  return <Icon {...props} />
}
