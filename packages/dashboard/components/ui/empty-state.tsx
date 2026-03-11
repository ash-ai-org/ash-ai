import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {icon && <div className="mb-4 text-white/30">{icon}</div>}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-white/50">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
