import Providers from '@/components/providers'
import ErrorBoundary from '@/components/error-boundary'
import { Toaster } from '@/components/ui/sonner'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <ErrorBoundary>
        {children}
        <Toaster />
      </ErrorBoundary>
    </Providers>
  )
}
