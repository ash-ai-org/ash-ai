import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-[#1c2129] transition-all duration-200',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('flex flex-col space-y-1.5 px-4 pt-4 pb-0 sm:px-6 sm:pt-6 sm:pb-0', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3 className={cn('text-lg font-semibold leading-none tracking-tight text-white', className)}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('p-4 sm:p-6', className)}>
      {children}
    </div>
  )
}
