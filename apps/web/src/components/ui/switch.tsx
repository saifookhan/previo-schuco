import { cn } from '@/lib/utils'

/**
 * On/off control for a single setting. The accessible name stays on the button (`label`);
 * `checked` is the state, so a screen reader hears both.
 */
export const Switch = ({
  checked,
  disabled,
  label,
  onCheckedChange,
  className,
}: {
  checked: boolean
  disabled?: boolean
  /** Accessible name, including which family the switch belongs to. */
  label: string
  onCheckedChange: (next: boolean) => void
  className?: string
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60',
      checked ? 'bg-brand' : 'bg-slate-300',
      className,
    )}
  >
    <span
      aria-hidden
      className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5',
      )}
    />
  </button>
)
