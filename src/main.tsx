import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './features/auth/AuthProvider'
import { BooksProvider } from './features/books/BooksProvider'
import { ThemeProvider } from './features/settings/theme'
import { TextSizeProvider } from './features/settings/text-size'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
  </StrictMode>,
)
