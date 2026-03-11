import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, placeholder, id, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-white/70">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            'flex h-9 w-full rounded-xl border px-3 py-1 text-sm transition-all duration-200',
            'bg-white/5 border-white/10 text-white',
            'focus-visible:outline-none focus-visible:border-indigo-500/50',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" className="bg-[#1c2129]">
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              className="bg-[#1c2129]"
            >
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }
)
Select.displayName = 'Select'
