import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@zonsh/ui'
import { getRouter } from './router'
import { queryClient } from './lib/query'
import './styles.css'

const router = getRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Same key and default as public/theme.js, which applies it before the first paint. */}
    <ThemeProvider storageKey="openpanel-theme" defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
