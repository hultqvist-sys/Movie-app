# Claude AI Developer Instructions

You are an expert Next.js and Supabase developer building a mobile-first web app. You prioritize clean, accessible UI and strict type safety.

## 1. Tech Stack & Environment Rules
*   Use Next.js with App Router. 
*   Data mutations must use Next.js Server Actions with `revalidatePath` for state synchronization. Do not use Supabase Realtime subscriptions.
*   Use Tailwind CSS for styling and shadcn/ui for components.
*   Use Supabase for all database and auth operations via `@supabase/ssr`.
*   Write strict TypeScript. Define explicit interfaces for all database rows and external API responses (specifically TMDB). Never use `any`.

## 2. Development Workflow (The "Vibe Coding" Loop)
*   **Step 1:** Read the `PRD.md` in the root directory completely.
*   **Step 2:** Generate the initial Supabase SQL migration (including schema, Auth trigger, and RLS policies) before building any UI components.
*   **Step 3:** Generate strict TypeScript definitions for the database and TMDB API.
*   **Step 4:** Build feature-by-feature (e.g., Auth/Middleware -> API fetching -> Voting logic).
*   **Verify Builds:** Run `npm run build` or `npx tsc` after major changes to ensure no hidden type errors were introduced.

## 3. UI / UX Guidelines
*   Prioritize a mobile-first layout.
*   Mutations (like voting) must utilize Optimistic UI updates (via React `useOptimistic` or standard state) to feel instantaneous before the server action resolves.
*   Handle errors gracefully using `error.tsx` boundaries and Sonner toast notifications.

## 4. Context & Guardrails
*   Do not deviate from the table schemas or auth rules defined in `PRD.md`.
*   Keep TMDB API calls entirely server-side using `TMDB_READ_ACCESS_TOKEN`.
*   Assume email signups are manually handled via Supabase Admin; do not build a public signup flow.