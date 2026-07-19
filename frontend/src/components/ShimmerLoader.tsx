type ShimmerLoaderProps = {
  width?: string
  height?: string
  rounded?: string
}

export function ShimmerLoader({
  width = '100%',
  height = '1rem',
  rounded = '0.5rem',
}: ShimmerLoaderProps) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse"
      style={{
        width,
        height,
        borderRadius: rounded,
        backgroundColor: 'var(--color-surface-container-high)',
      }}
    />
  )
}
