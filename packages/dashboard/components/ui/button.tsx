import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const variantStyles = {
  primary:
    'bg-indigo-500 text-white font-medium hover:bg-indigo-400',
  secondary:
    'border border-white/20 bg-white/5 text-white hover:bg-white/10 hover:border-white/30',
  ghost: 'text-white/70 hover:text-white hover:bg-white/10',
  danger:
    'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30',
}

const sizeStyles = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-9 px-4 text-sm rounded-xl',
  lg: 'h-10 px-6 text-sm rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          'disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
