import { useUIStore } from '@/stores'
import { Button } from '@/components/ui'

/** Toggles light/dark. The store holds the theme; App applies the class. */
export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
    >
      {theme === 'light' ? 'Dark' : 'Light'}
    </Button>
  )
}
