export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: {
  variant?: 'text' | 'card' | 'circle' | 'button'
  width?: string | number
  height?: string | number
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`app-skeleton app-skeleton--${variant} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}
