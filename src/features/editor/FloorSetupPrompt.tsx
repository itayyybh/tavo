import { useState } from 'react'
import { Button, Heading, Text } from '@/components/ui'
import { useLayoutStore } from '@/stores'
import { loadLayout as loadLocalLayout } from '@/services/layoutStorage'

/**
 * Onboarding overlay for a fresh restaurant with no floor yet (Phase 9). Shown
 * over the editor canvas when the layout is hydrated but empty. Two ways
 * forward: start building, or import a layout saved locally on this device
 * (the migration path from the pre-database single-restaurant build).
 */
export function FloorSetupPrompt({ onCreate }: { onCreate: () => void }) {
  const loadSnapshot = useLayoutStore((s) => s.loadSnapshot)
  // A local layout only exists on the machine that built one before the DB.
  const [localLayout] = useState(() => loadLocalLayout())

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-soft)]">
        <Heading className="text-lg">Set up your floor</Heading>
        <Text className="mx-auto mt-2 max-w-sm text-muted">
          This restaurant doesn't have a layout yet. Build one from scratch, or
          load a layout you saved on this device.
        </Text>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button onClick={onCreate}>Create a layout</Button>
          {localLayout && (
            <Button
              variant="secondary"
              onClick={() => {
                loadSnapshot(localLayout)
                onCreate()
              }}
            >
              Load my saved layout
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
