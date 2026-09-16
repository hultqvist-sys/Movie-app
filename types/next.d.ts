/**
 * Next.js PageProps type definitions for route handlers
 */

type PageProps<Path extends string> = {
  params: Record<string, string | string[]>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type { PageProps };