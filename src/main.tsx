import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import '@/i18n'
import { AuthGate } from '@/features/auth'
import { stashInviteFromUrl } from '@/features/auth/pendingInvite'
import './index.css'

// Capture an ?invite=CODE before anything can strip it from the URL; the session
// store redeems it centrally once authenticated.
stashInviteFromUrl()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  </StrictMode>,
)
