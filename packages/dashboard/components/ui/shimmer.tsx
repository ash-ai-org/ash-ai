import { cn } from '@/lib/utils'

export function ShimmerLine({
  width = '100%',
  height = 16,
  className,
}: {
  width?: string | number
  height?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-md',
        'bg-gradient-to-r from-white/5 via-white/10 to-white/5',
        'bg-[length:200%_100%]',
        'animate-[shimmer_1.5s_ease-in-out_infinite]',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height,
      }}
    />
  )
}

export function ShimmerBlock({
  width = '100%',
  height = 100,
  className,
}: {
  width?: string | number
  height?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl',
        'bg-gradient-to-r from-white/5 via-white/10 to-white/5',
        'bg-[length:200%_100%]',
        'animate-[shimmer_1.5s_ease-in-out_infinite]',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height,
      }}
    />
  )
}
