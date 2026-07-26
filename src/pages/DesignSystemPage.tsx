import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Heading,
  Input,
  Panel,
  StatusBadge,
  Text,
} from '@/components/ui'
import type { TableStatus } from '@/types'

const STATUSES: TableStatus[] = ['available', 'reserved', 'occupied', 'blocked']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <Heading level={2}>{title}</Heading>
      {children}
    </section>
  )
}

/** Living styleguide — visual reference and verification for the design system. */
export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-6 py-12">
      <header className="space-y-1">
        <Heading level={1}>Design System</Heading>
        <Text muted>
          Reusable primitives for a premium, minimal restaurant management platform.
        </Text>
      </header>

      <Section title="Typography">
        <Card className="space-y-2">
          <Heading level={1}>Heading 1 — floor overview</Heading>
          <Heading level={2}>Heading 2 — section</Heading>
          <Heading level={3}>Heading 3 — label</Heading>
          <Text>Body text for descriptions and content.</Text>
          <Text muted>Muted text for secondary information.</Text>
        </Card>
      </Section>

      <Section title="Buttons">
        <Card className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </Card>
      </Section>

      <Section title="Inputs">
        <Card className="grid max-w-md gap-4">
          <Input label="Guest name" placeholder="e.g. Alex Morgan" />
          <Input label="Party size" type="number" placeholder="2" />
          <Input label="Phone" error="Phone number is required" placeholder="+1…" />
        </Card>
      </Section>

      <Section title="Table status">
        <Card className="flex flex-wrap gap-3">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </Card>
      </Section>

      <Section title="Badges">
        <Card className="flex flex-wrap gap-3">
          <Badge>VIP</Badge>
          <Badge>Outside</Badge>
          <Badge>Baby chair</Badge>
        </Card>
      </Section>

      <Section title="Panel">
        <Panel
          title="Reservations"
          actions={<Button size="sm">New</Button>}
          className="max-w-md"
        >
          <Text muted>Panels host lists, settings, and editor sidebars.</Text>
        </Panel>
      </Section>

      <Section title="Dialog">
        <Card>
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Seat guests"
          >
            <Text muted className="mb-4">
              Confirm seating for the selected reservation.
            </Text>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
            </div>
          </Dialog>
        </Card>
      </Section>
    </div>
  )
}
