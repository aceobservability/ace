import { Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PlaceholderPageProps = {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-[var(--page-padding)]">
      <h1 className="font-display text-3xl font-bold tracking-tight text-on-surface">{title}</h1>
      <p className="max-w-md text-center text-sm text-on-surface-variant">
        {description ?? 'Feature port in progress — Vue → React rewrite.'}
      </p>
      <Button variant="outline" size="sm">
        <Construction className="size-4" aria-hidden />
        React foundation
      </Button>
    </div>
  )
}