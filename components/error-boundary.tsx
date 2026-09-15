"use client"

import { useEffect } from "react"
import { ErrorBoundary, type FallbackProps } from "react-error-boundary"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  // Side effects must be in useEffect, not in the render body.
  useEffect(() => {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    toast.error(message)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <p className="text-sm font-medium">Something went wrong</p>
      <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  )
}

/**
 * Reusable React error boundary wrapper for use inside specific page sections.
 * For route-level errors, Next.js uses `app/error.tsx` automatically.
 */
export default function AppErrorBoundary({
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
