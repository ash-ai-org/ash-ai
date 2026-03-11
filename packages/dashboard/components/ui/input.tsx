import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-white/70">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'flex h-9 w-full rounded-xl border px-3 py-1 text-sm transition-all duration-200',
            'bg-white/5 border-white/10 text-white placeholder:text-white/40',
            'focus-visible:outline-none focus-visible:border-indigo-500/50 focus-visible:bg-white/10',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500/50 focus-visible:border-red-400',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
