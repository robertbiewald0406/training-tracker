import { Dumbbell } from './icons'

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-ink" role="separator">
      <div className="h-0.5 flex-1 bg-ink" />
      <Dumbbell className="size-8" />
      <div className="h-0.5 flex-1 bg-ink" />
    </div>
  )
}
