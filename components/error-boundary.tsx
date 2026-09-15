"use client"

import { ErrorBoundary } from "react-error-boundary"
import { toast } from "sonner"

type ErrorFallbackProps = {
  error: Error
  resetErrorBoundary: () => void
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  toast.error(error.message)
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <h2 className="text-lg font-medium">Something went wrong</h2>
      <button 
        onClick={resetErrorBoundary}
        className="mt-2 text-sm text-blue-500 hover:underline"
      >
        Try again
      </button>
    </div>
  )
}

export default function ErrorBoundaryWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}