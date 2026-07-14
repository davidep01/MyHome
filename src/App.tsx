import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { AuthGate } from './components/auth/AuthGate'
import { AppErrorBoundary } from './components/system/AppErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <MotionConfig reducedMotion="user">
          <AuthGate>
            <AppShell />
          </AuthGate>
        </MotionConfig>
      </AppErrorBoundary>
    </QueryClientProvider>
  )
}
