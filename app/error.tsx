"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/**
 * Next.js App Router error boundary (HANDOVER.md §4.5).
 * Catches unhandled errors thrown by Server Components and Client Components
 * in the same route segment. Surfaces a Sonner toast so the user gets
 * feedback without a full-page crash.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    toast.error(error.message || "Something went wrong")
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h2 className="font-heading text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. You can try again or refresh the page.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
