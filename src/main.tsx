import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
// Self-hosted Plus Jakarta Sans (variable, weights 200–800). Bundled and
// content-hashed by Vite, precached by the PWA, and subset by unicode-range so
// only the latin file downloads for id/en text — no external font servers.
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './features/auth/AuthProvider'
import { BooksProvider } from './features/books/BooksProvider'
import { ThemeProvider } from './features/settings/theme'
import { TextSizeProvider } from './features/settings/text-size'
import { LanguageProvider } from './features/settings/language'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
    <ThemeProvider>
      <TextSizeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BooksProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </BooksProvider>
          </AuthProvider>
        </QueryClientProvider>
      </TextSizeProvider>
    </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
)
