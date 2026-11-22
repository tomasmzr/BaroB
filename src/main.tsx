import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ToastProvider } from './components/ui'
import './index.css'
import { SessionProvider } from './state/session'

registerSW({ immediate: true })

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <HashRouter>
        <SessionProvider>
          <ToastProvider>
            <div className="app">
              <App />
            </div>
          </ToastProvider>
        </SessionProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
