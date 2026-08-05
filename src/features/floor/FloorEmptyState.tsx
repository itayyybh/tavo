import { Link } from 'react-router-dom'
import { Button, Heading, Text } from '@/components/ui'

/**
 * Live Floor empty state (Phase 9) — shown when the active restaurant has no
 * layout yet. The floor is a view of the layout, so there's nothing to operate
 * until one exists; send the host to the Editor to build it.
 */
export function FloorEmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-soft)]">
        <Heading className="text-lg">No floor to run yet</Heading>
        <Text className="mx-auto mt-2 max-w-sm text-muted">
          Build your restaurant's layout first — add zones and tables in the Editor, and
          they'll appear here to seat guests on.
        </Text>
        <Link to="/editor" className="mt-6 inline-block">
          <Button>Open the Editor</Button>
        </Link>
      </div>
    </div>
  )
}
