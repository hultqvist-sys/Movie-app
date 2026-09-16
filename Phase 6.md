# Phase 6: Polish & Launch (Micro-Prompts) — REVISED v3

**Revision note (v3):** the original Phase 6 targeted `components/media/MediaDetailModal.tsx`,
which **no longer exists** — the detail view became a real page at
`/media/[type]/[id]` in Phase 3. Step 6.2's TMDB hardening was also **already built and
live-tested in Phase 1.5**, so it is now a verification step rather than new work
(rewriting `lib/tmdb.ts` here would risk breaking a property we have proven). Added dark
mode, metadata, a 404 page, an accessibility pass, and a launch checklist.

---

## Prerequisites

- [ ] Phases 3, 4 and 5 complete
- [ ] `npm run build`, `npx tsc --noEmit`, `npx eslint .` all clean

---

## Instructions for the Developer

1. Paste the **House Rules** block from `Phase 3.md`, then the prompt for the current step.
2. Wait for it to generate the code and apply the changes.
3. Run `npm run build` to verify there are no errors.
4. Commit with **`git add -A && git commit -m "feat: phase 6.X complete"`**
   > ⚠️ Not `git commit -am` — `-a` skips new untracked files, and most steps create them.
5. Move on to the next step.

> **This whole phase is `[POLISH]`.** Nothing here should change behaviour or data flow.
> If a step seems to require restructuring a component's state or moving a `'use client'`
> boundary, stop — that is architectural work that belonged in Phases 3–5. See the
> "Do not defer these" list at the top of `Phase 3.md`.

---

### Step 6.1: Loading States & Skeletons `[POLISH]`

**Copy and paste this prompt:**

> Task: Add loading UI so the screen does not jump while TMDB and Supabase data resolve.
>
> 1. Create `components/media/MediaCardSkeleton.tsx`:
>    - ⚠️ Put it in `components/media/`, **not `components/ui/`**. That directory is
>      managed by the shadcn CLI and a future `npx shadcn add` could overwrite files
>      there; it is also reserved for primitives, not app components.
>    - ⚠️ Make it a **Server Component** — do **not** add `"use client"`. It is static
>      markup with no state or handlers, so a client bundle is pure overhead.
>    - Use the shadcn `Skeleton` primitive. Match `MediaCard`'s real dimensions exactly:
>      an `aspect-[2/3]` block for the poster, then short bars for the title line and the
>      year/score row. Mismatched dimensions cause the layout shift this step exists to
>      prevent.
>
> 2. Create `app/loading.tsx`:
>    - Renders the same responsive grid as the Browse tab
>      (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`) filled with 10
>      `<MediaCardSkeleton />`.
>    - ⚠️ Also include a skeleton for the tab bar, so the tabs do not pop into place
>      after the grid renders.
>
> 3. Create `app/media/[type]/[id]/loading.tsx`:
>    - ⚠️ **This file is required.** `app/loading.tsx` is inherited by every nested route
>      that lacks its own, so without this the detail page would flash a grid of poster
>      skeletons before showing a detail layout — worse than no skeleton at all.
>    - Mirror the detail page's shape instead: a wide backdrop block, a title bar, a few
>      text lines, and an `aspect-video` block for the trailer.
>
> 4. Do **not** add an `isLoading` state to the detail page. It is an async Server
>    Component; `loading.tsx` is its loading state. There is no client-side fetch to
>    track.
>
> Output the complete `MediaCardSkeleton.tsx`, `app/loading.tsx`, and
> `app/media/[type]/[id]/loading.tsx`.

---

### Step 6.2: Error Boundaries & Not-Found `[POLISH]`

**Copy and paste this prompt:**

> Task: Make failures degrade gracefully instead of showing a raw crash.
>
> 1. Update the **existing** `app/error.tsx`:
>    - ⚠️ This file already exists (added in Phase 2). It already accepts
>      `{ error, reset }`, fires a Sonner toast in a `useEffect`, and renders a
>      "Try again" button. **Restyle it; do not rewrite its behaviour.**
>    - Improve the copy to something friendlier, e.g. "We couldn't load this right now."
>    - ⚠️ **Do not render `error.message` to the user.** It can contain database or
>      internal details. Log it, show a generic message, and surface `error.digest` only
>      as small muted text for support purposes.
>
> 2. Create `app/global-error.tsx`:
>    - Client Component. Catches failures in the root layout itself, so it must render its
>      own `<html>` and `<body>`.
>    - ⚠️ **It replaces the root layout entirely, so it loses the fonts and Tailwind.**
>      Add `import './globals.css'` and apply the same font variable classes used in
>      `app/layout.tsx` (`--font-sans`), or you will ship an unstyled error page. This is
>      the single most common mistake with this file.
>    - Keep it dependency-light: plain markup and a reload button. If the layout is
>      broken, components that rely on providers may also be broken.
>
> 3. Create `app/not-found.tsx`:
>    - ⚠️ **Required.** The detail page calls `notFound()` for an invalid `type` or `id`
>      (Phase 3, Step 3.3), and those URLs are reachable by hand, so this path will be
>      hit. Without this file users get Next.js's unstyled default 404.
>    - Friendly message plus a link back to `/`.
>
> 4. **Verify — do not rewrite — `lib/tmdb.ts`.**
>    - ⚠️ The never-throws contract is **already implemented and was verified against a
>      running server in Phase 1.5**: with no token the app returned HTTP 200 and logged
>      `TMDB_READ_ACCESS_TOKEN is not set`; with an invalid token it returned HTTP 200 and
>      logged `401 Unauthorized`. Both paths already funnel to `console.warn` plus
>      `[]`/`null`.
>    - Your task is only to **confirm** that missing-token, non-2xx, network-throw and
>      malformed-JSON paths all still return `[]`/`null`. **Report what you found and
>      change nothing** unless a gap actually exists. Do not refactor this file.
>
> Output the updated `app/error.tsx` and the complete `app/global-error.tsx` and
> `app/not-found.tsx`.

---

### Step 6.3: Mobile UX & Tap Targets `[POLISH]`

**Copy and paste this prompt:**

> Task: Final mobile pass so the app feels native on a phone.
>
> 1. `components/media/VoteControls.tsx` and `components/media/MediaActionsMenu.tsx`:
>    - ⚠️ **Tap targets are genuinely too small by default.** Our `base-nova` `Button`
>      sizes are compact — `default` is `h-8` (32px), `sm` is `h-7`, `xs` is `h-6`, all
>      below the ~44px iOS guideline. Raise the interactive controls to at least `h-10`
>      (40px), ideally `h-11`, via `className`.
>    - Space the three vote buttons with `gap-2` minimum so thumbs cannot hit two at once.
>
> 2. `components/media/MarkWatchedModal.tsx` (and any other `Dialog`):
>    - Add `max-h-[90vh] overflow-y-auto` to `DialogContent` so a long household list
>      never overflows a short screen.
>    - Mobile-first padding: `p-4 sm:p-6`.
>    - Make each checkbox row at least `h-10` and ensure the whole row is tappable via
>      the `htmlFor`/`id` label association already specified in Phase 4.2.
>
> 3. `app/media/[type]/[id]/page.tsx`:
>    - ⚠️ This replaces the original instruction, which targeted a
>      `MediaDetailModal.tsx` that no longer exists.
>    - Verify the layout holds at 320px wide (iPhone SE): the trailer keeps its
>      `aspect-video` without overflowing, provider badges wrap rather than scroll
>      horizontally, and the three-dot menu stays reachable in the header.
>    - Long titles must wrap rather than push the menu button off-screen.
>
> 4. `components/layout/Navbar.tsx`:
>    - Confirm the title, notification bell and avatar fit at 320px without wrapping.
>      Prefer truncating the title (`truncate`) over `flex-wrap`, which would double the
>      header height.
>    - The bell's unread `Badge` must not clip at the header edge.
>
> 5. Add `overscroll-behavior-y: contain` to scrollable popover and dialog content so
>    scrolling inside them does not pull the page behind.
>
> ⚠️ Change Tailwind classes only. **Do not alter component props, state, or
> server/client boundaries** — if a fix seems to need that, flag it instead.
>
> Output the updated files with adjusted classes only.

---

### Step 6.4: Dark Mode Toggle `[POLISH]`

> **NEW.** `components/providers.tsx` (Phase 2) already wraps the app in `next-themes`
> with `attribute="class"`, and `components/ui/sonner.tsx` already calls `useTheme()`.
> The plumbing exists — there is simply no control, so the app is stuck on "system".

**Copy and paste this prompt:**

> Task: Add a theme toggle.
>
> 1. Create the Client Component `components/layout/ThemeToggle.tsx`:
>    - Use `useTheme()` from `next-themes` and the `Sun` / `Moon` icons from
>      `lucide-react`.
>    - Cycle or choose between `light`, `dark` and `system`.
>    - ⚠️ **Guard against hydration mismatch.** On the server `resolvedTheme` is
>      undefined, so rendering the icon immediately produces a mismatch warning. Track a
>      `mounted` flag in `useEffect` and render a same-sized placeholder until mounted.
>    - Give it an `aria-label` describing the action, not just the current state.
>
> 2. Add it to `components/layout/Navbar.tsx`, either beside the bell or inside the
>    existing account dropdown. The Navbar stays a Server Component; `ThemeToggle` is the
>    client island.
>
> 3. Verify `app/globals.css`'s dark tokens render correctly on: the poster cards, the
>    detail page, dialogs, popovers, and Sonner toasts.
>
> Output the complete `ThemeToggle.tsx` and the updated `Navbar.tsx`.

---

### Step 6.5: Metadata & Shareable Links `[POLISH]`

> **NEW.** `app/layout.tsx` sets a title and description, and the detail page adds
> `generateMetadata` (Phase 3.3) — but nothing produces link previews, and household
> members will paste these URLs to each other.

**Copy and paste this prompt:**

> Task: Add social metadata and mobile web-app metadata.
>
> 1. Update `app/layout.tsx`:
>    - Add `metadataBase` (read from an env var with a localhost fallback), plus
>      `openGraph` and `twitter` blocks.
>    - Add a `viewport` export with `themeColor` matching the app background, and
>      `width: 'device-width', initialScale: 1`.
>    - ⚠️ Use the `Viewport` type export, **not** a `<meta name="viewport">` tag —
>      Next.js 16 has a dedicated `viewport` export and a manual tag will be overridden.
>
> 2. Update `generateMetadata` in `app/media/[type]/[id]/page.tsx`:
>    - Include the title, a truncated overview as the description, and the TMDB poster as
>      the `openGraph` image via `getPosterUrl(posterPath, 'w780')`.
>    - ⚠️ Handle the `null` cases — no poster, or TMDB unavailable. Fall back to static
>      site metadata rather than emitting an empty image URL.
>    - ⚠️ Do **not** add a second TMDB request. `generateMetadata` and the page component
>      both run per request; rely on Next.js's automatic deduplication of identical
>      `fetch` calls rather than restructuring the page.
>
> 3. Add `app/manifest.ts` returning a minimal web app manifest (name, short name,
>    icons, `display: 'standalone'`, theme colours) so the app installs cleanly to a
>    phone home screen.
>
> Output the updated `app/layout.tsx`, the updated detail page, and `app/manifest.ts`.

---

### Step 6.6: Accessibility & Motion Pass `[POLISH]`

> **NEW.** Individual phases specified `aria-label`s and `aria-pressed`; this is the
> end-to-end sweep.

**Copy and paste this prompt:**

> Task: Accessibility and motion pass. Make no behavioural changes.
>
> 1. Add a skip link as the first focusable element in `app/layout.tsx`, pointing at the
>    `<main>` element (give it `id="main"`). Visually hidden until focused.
> 2. Keyboard-audit every interactive control and report findings:
>    - Every vote button, the three-dot menu, the bell popover, dialogs and the card
>      poster link must be reachable and operable by keyboard alone.
>    - Focus must be visible throughout — our `base-nova` components already ship
>      `focus-visible:ring-*`; flag anything that lost it via a `className` override.
>    - Dialogs and popovers must trap focus and restore it to the trigger on close.
>      Base UI handles this; verify rather than reimplement.
> 3. Confirm no control conveys meaning by colour alone — the active vote button needs a
>    non-colour cue (border, weight or icon) as well.
> 4. Respect `prefers-reduced-motion`: gate the `animate-in` / `zoom-in` utilities used
>    by dialogs and popovers behind Tailwind's `motion-safe:` variant.
> 5. Check text contrast in **both** themes, particularly `text-muted-foreground` on
>    card backgrounds.
> 6. Confirm every `<Image>` has a meaningful `alt`, and that the no-poster fallback
>    still announces the title (Phase 1.5 used `role="img"` with an `aria-label` — keep
>    that).
>
> Report what you changed and what you verified as already correct. Output only the files
> you actually modified.

---

## Launch Checklist

Not prompts — verify these by hand before sharing the URL.

### Supabase
- [ ] Migrations `0001`, `0002`, `0003` applied to the production project
- [ ] **Email signups disabled** in the dashboard (PRD §3 — signups are closed)
- [ ] The 3 household members invited manually via the Admin dashboard
- [ ] Each invited user got a `profiles` row — proves the `handle_new_user` trigger fires
- [ ] RLS confirmed **enabled** on all five tables
- [ ] Guest check: with a signed-out browser, confirm reads work and every write fails

### Environment
- [ ] `TMDB_READ_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      all set in Vercel, for **Production *and* Preview**
- [ ] ⚠️ Confirm no `NEXT_PUBLIC_` prefix ever gets added to the TMDB token
- [ ] ⚠️ **Do not delete `yarn.lock`.** `package-lock.json` resolves every package
      through `packages.atlassian.com`, an internal mirror unusable from Vercel.
      Deployments currently succeed *because* `yarn.lock` uses the public registry.
      Fix properly by regenerating `package-lock.json` against the public registry, then
      settle on one package manager.

### Behaviour
- [ ] Signed out: `/` returns **200** with scores visible and no vote buttons — **not** a
      redirect to `/login`
- [ ] Signed out: a detail URL loads, shows reviews, hides the watchlist button, review
      form and three-dot menu
- [ ] Signed in: vote → refresh → the vote persisted
- [ ] Mark watched tagging all 3 members succeeds (the Step 4.0a case)
- [ ] Notification click lands on the correct `/media/[type]/[id]`, including for TV
- [ ] Browser back button works from a detail page and from a notification
- [ ] An invalid detail URL shows the styled 404 from Step 6.2, not a crash

### Resilience
- [ ] Temporarily unset `TMDB_READ_ACCESS_TOKEN` in a Preview deploy: the app still
      returns **200** with empty states. **This is the Phase 1.5 guarantee — if it 500s,
      something regressed it.**
- [ ] No console errors or hydration warnings on `/`, a detail page, or `/login`
- [ ] Lighthouse mobile pass; check no layout shift from the skeletons in Step 6.1

### Known gaps at launch
- [ ] **The PRD is still truncated** and its §5 RLS policies were never supplied. Every
      policy in `0001` remains inferred (`HANDOVER.md` §3).
- [ ] **No automated tests.** The three places a regression would be silent: vote
      arithmetic, house-average null handling, and the `was_present` default.
- [ ] `middleware.ts` → `proxy.ts` rename, if still outstanding
- [ ] `app/login/page.tsx` synchronous-`searchParams` bug, if still outstanding
- [ ] Node 20 vs 22 — `@supabase/supabase-js` warns Node ≤20 is deprecated
- [ ] Update `HANDOVER.md` to reflect the final state before any further handover
