# Phase 3: Watchlist & Voting Engine (Micro-Prompts) — REVISED v3

**Revision note (v3):** the Media Detail view is now a **real page** at
`/media/[type]/[id]`, not a modal. This is a simplification, not extra work — a Server
Component page can call `lib/tmdb.ts` directly, so the Server Action wrapper v2 needed is
gone, and `MediaCard` can stay a Server Component. Added Step 3.6 (search). Revised
against commit `74f8332` + the Phase 2 merge. See `HANDOVER.md`.

---

## ⚠️ Do not defer these — they look like UI but are architecture

The plan is **functionality first, visual polish last** (`Phase 6.md` collects the
polish). That works here because every component is built on shadcn primitives, so
sensible styling comes for free, and because the data layer is UI-agnostic — `CardMedia`
normalises TMDB and database rows into one shape, and `MediaCard` takes **slots** rather
than feature props. Redesign the look later and the logic underneath survives.

But the following are **structural, not cosmetic**. Deferring any of them means a rewrite
rather than a repaint, so they are built into Phases 3–5 deliberately. If an AI proposes
"we'll add this in the polish phase", that is the trap:

| Item | Why it cannot wait |
| --- | --- |
| **Optimistic voting (`useOptimistic`)** | A state-model decision. Retrofitting rewrites the component's data flow. |
| **Server vs Client component boundaries** | Determines what can fetch what. Moving a `'use client'` line later cascades through the tree. |
| **Slots vs props on `MediaCard`** | Build it with 8 feature props and switching to slots means editing every call site. |
| **Detail page rather than a modal** | A routing decision. Deferring means building a modal and then throwing it away. |
| **Hydration-safe date formatting** | Presents as a UI detail; is actually a correctness bug. |
| **Guests: controls removed, not disabled** | Behavioural (focus order), not decorative. |
| **Accessible primitives** (`aria-pressed`, label association, real `<button>`s) | Nearly free upfront, tedious to retrofit across every control. |

Every step below is tagged `[FUNCTIONAL]` or `[POLISH]`. Only `[POLISH]` work may move to
Phase 6.

---

## Prerequisites — do these before Step 3.0

- [ ] **Phase 2 is merged.** These prompts assume `lib/supabase/server.ts` and
      `lib/supabase/client.ts` exist.
- [ ] **Rename `middleware.ts` → `proxy.ts`.** Next.js 16 deprecated the `middleware`
      file convention. Run `npx @next/codemod@canary middleware-to-proxy .`
- [ ] **Fix `app/login/page.tsx`.** `searchParams` is a `Promise` in Next.js 16 and is
      currently read synchronously, so login error messages never display.
- [ ] **Approve the two migrations in Phase 4, Step 4.0** before starting Phase 4.
      Nothing in Phase 3 depends on them.

---

## Instructions for the Developer

Do not feed this entire document to the AI at once. Weaker AIs will suffer context
collapse if given too many tasks.

1. Paste the **House Rules** block below, then the prompt for the current step.
2. Wait for it to generate the code and apply the changes.
3. Run `npm run build` to verify there are no errors.
4. Commit with **`git add -A && git commit -m "feat: phase 3.X complete"`**
   > ⚠️ Do **not** use `git commit -am`. The `-a` flag only stages *tracked* files, and
   > every step below creates **new** files. They would be silently left uncommitted.
5. Move on to the next step.

### House Rules — paste this before every prompt in this phase

> **Project context (do not deviate):**
> - Next.js **16.3.5**, App Router, React 19, strict TypeScript. **Never use `any`.**
> - shadcn/ui in the **`base-nova`** style, built on **`@base-ui/react`, not Radix**.
>   There is **no `asChild`** — use the `render` prop with a `ReactElement`.
>   There is **no `components/ui/form.tsx`** and it cannot be installed.
> - Supabase server client: `import { createClient } from '@/lib/supabase/server'`.
>   It is **async** — always `const supabase = await createClient()`.
> - Browser client: `import { createClient } from '@/lib/supabase/client'` (not async).
> - Database types live in `@/types/database.types` and already export `Media`, `Vote`,
>   `Review`, `Profile`, `Notification`, `MediaType`, `MediaStatus`, `VoteValue`
>   (`2 | 1 | -1`), `StarRating` (`1|2|3|4|5`), and `Tables<'…'>` helpers.
>   **Reuse these — never redeclare or widen them to `number`.**
> - `lib/tmdb.ts` is **server-only** (it reads `process.env.TMDB_READ_ACCESS_TOKEN`,
>   which is not `NEXT_PUBLIC_`). **Never import its fetch functions into a Client
>   Component** — the token is stripped from client bundles and every call silently
>   returns null/empty. Its pure helpers (`getPosterUrl`, `getMediaTitle`,
>   `getMediaYear`) are safe anywhere.
> - `lib/tmdb.ts` guarantees **no function ever throws**: missing token, non-2xx,
>   network error and bad JSON all return `[]` or `null` after a `console.warn`.
>   **Preserve that contract** and never substitute mock data.
> - In Next.js 16, `params` and `searchParams` are **Promises** and must be awaited.
>   Use the generated `PageProps<'/route'>` type — never hand-write the props shape.
> - Mutations use **Server Actions + `revalidatePath`**. **No Supabase Realtime.**
> - Only do exactly what is asked. Do not modify files outside the stated scope.
> - Output complete files. No placeholders like `// rest of code`.

---

### Step 3.0: Install components & normalise the card data model `[FUNCTIONAL]`

> **NEW STEP.** `MediaCard` currently accepts `media: TMDBMedia`, discriminated on
> `media_type`. The Watchlist and Watched tabs read the Supabase `media` table, whose rows
> use `type` instead and carry none of the TMDB fields. Without a shared shape, Steps 3.5,
> 4.4 and 5.4 will not type-check. Fix it once, here, before the card grows.

**First, run this in your terminal** (required by Phases 4–5, not yet installed; all four
exist in the `base-nova` registry):

```bash
npx shadcn@latest add checkbox textarea popover scroll-area --yes
```

**Then copy and paste this prompt:**

> Task: Introduce a single normalised view model for media cards.
>
> 1. Create `lib/media-model.ts`:
>    - Export `interface CardMedia` with exactly: `id: number`, `title: string`,
>      `type: MediaType`, `posterPath: string | null`, `year: string | null`,
>      `status: MediaStatus | null`. (`status` is `null` for Browse results not yet
>      saved to our database.)
>    - Export `fromTMDB(media: TMDBMedia): CardMedia`. Map `media_type` → `type`,
>      `poster_path` → `posterPath`, derive `year` via the existing `getMediaYear`
>      helper, `status: null`. **Do not re-implement title/year logic** — reuse
>      `getMediaTitle` and `getMediaYear` from `@/lib/tmdb`.
>    - Export `fromDbRow(row: Media): CardMedia`. Map `type` across, `poster_path` →
>      `posterPath`, `status` across, and set `year: null` (we do not store release
>      dates).
>    - This file must not import anything that reads `process.env`; Client Components
>      will import it. Importing the pure string helpers from `@/lib/tmdb` is fine.
>
> 2. Update `components/media/MediaCard.tsx`:
>    - **Keep it a Server Component.** Do *not* add `"use client"`. Interactive parts
>      arrive as slots from Step 3.5 onward, so the card itself never needs state.
>    - Change the prop type to `media: CardMedia` and read `media.title`,
>      `media.posterPath`, `media.year`, `media.type`.
>    - Add two optional slots: `voteControls?: React.ReactNode` and
>      `actions?: React.ReactNode`, rendered below the poster and in the footer.
>      **All later phases use these slots instead of adding new props.**
>    - Build the poster URL with `getPosterUrl(media.posterPath)`.
>    - Keep existing behaviour exactly: fixed `aspect-[2/3]` poster, `ImageOff` fallback
>      when `posterPath` is null, Movie/TV badge, `line-clamp-2` title, and the
>      `voteScore` placeholder rendering an em dash (`—`) when `undefined`.
>      **A real `0` and "not loaded" must stay visually distinct.**
>
> 3. Update `app/page.tsx` so the Browse tab maps results through `fromTMDB(...)`.
>    Change nothing else; keep `export const dynamic = 'force-dynamic'`.
>
> Output the complete `lib/media-model.ts`, `MediaCard.tsx`, and `app/page.tsx`.

---

### Step 3.1: The TMDB Fetching Upgrades `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Extend `lib/tmdb.ts` to expose trailers and streaming providers.
>
> 1. `getMediaDetails(id, type)` already requests `?append_to_response=videos`.
>    **Change that one query parameter to `?append_to_response=videos,watch/providers`**
>    rather than adding separate fetches — TMDB returns both in a single request, so no
>    `Promise.all` is needed and the existing videos call must not be duplicated.
> 2. Add a `TMDBWatchProviders` interface modelling the response: a `results` object keyed
>    by ISO country code, each value optionally containing `link: string` and `flatrate`,
>    `rent`, `buy` arrays of
>    `{ provider_id: number; provider_name: string; logo_path: string | null }`.
>    The JSON key is literally `"watch/providers"` — type it as such.
> 3. Add two helpers alongside the existing `getTrailers`:
>    - `getPrimaryTrailerKey(details: TMDBMediaDetails | null): string | null` — reuse
>      `getTrailers()` and return the first result's `key`, or `null`. Prefer
>      `official === true`.
>    - `getFlatrateProviders(details, region = 'US'): string[]` — return `flatrate`
>      provider names for that region, or `[]`. Keep `region` a parameter, not hardcoded.
> 4. **Preserve every existing export** (`getTrending`, `searchMedia`, `getMediaDetails`,
>    `getTrailers`, `getPosterUrl`, `getMediaTitle`, `getMediaReleaseDate`,
>    `getMediaYear`, `TMDB_IMAGE_BASE`, `TMDB_POSTER_SIZE`, and all interfaces).
> 5. **Preserve the safety contract**: no function may throw. Missing token, non-2xx,
>    network failure and malformed JSON must still `console.warn` and return `[]`/`null`.
>
> Output the entire, updated `lib/tmdb.ts`.

> **Note on display:** TMDB's watch-provider data is licensed from **JustWatch**, and
> TMDB's terms require visible attribution wherever you show it. Step 3.3 adds it.

---

### Step 3.2: Watchlist Server Actions `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Create the Server Actions for the Watchlist.
>
> Create `app/actions/watchlist.ts`.
>
> 1. Start with `'use server';`.
> 2. Import `createClient` from `@/lib/supabase/server` (`await createClient()`),
>    `revalidatePath` from `next/cache`, and types from `@/types/database.types`.
> 3. Write a private `requireUser()` helper that calls `supabase.auth.getUser()` and
>    returns a clear error when there is no user. Every action returns a typed result —
>    `{ ok: true }` or `{ ok: false; error: string }` — so callers show a Sonner toast
>    instead of crashing the page.
> 4. `addToWatchlist(media: CardMedia)` — import `CardMedia` from `@/lib/media-model`.
>    - Requires an authenticated user.
>    - **Upsert** into `media` with `onConflict: 'id'` so re-adding is a no-op rather
>      than a unique-constraint error. Map `id`, `title`, `type`,
>      `poster_path: media.posterPath`, `status: 'watchlist'`.
>    - ⚠️ On conflict, **do not overwrite `status`** — something already `watched` or
>      `currently_watching` must not be demoted back to `watchlist`. Use
>      `ignoreDuplicates: true`, or insert and tolerate error code `23505`.
> 5. `markCurrentlyWatching(mediaId: number)` — update that row to
>    `status: 'currently_watching'`.
> 6. `removeFromWatchlist(mediaId: number, force = false)`
>    - ⚠️ **DESTRUCTIVE.** `votes`, `reviews` and `notifications` all declare
>      `media_id … on delete cascade`. Deleting a `media` row **permanently destroys
>      every vote, review and notification** attached to it.
>    - First count rows in `votes` and `reviews` for this `media_id`. If either is
>      non-zero and `force` is false, **do not delete** — return
>      `{ ok: false, error: '…has N votes and M reviews…' }` so the UI can confirm.
>    - Only delete when nothing would be lost, or when `force === true`.
>    - Document the cascade in a comment above the function.
> 7. Call `revalidatePath('/')` after each successful mutation.
>
> Output the complete `app/actions/watchlist.ts`.

---

### Step 3.3: The Media Detail **Page** `[FUNCTIONAL]`

> **CHANGED IN v3.** This was a modal. It is now a real route, which is both simpler and
> better: notifications (Phase 5) can link straight to it, the back button behaves
> normally, links are shareable, and — because it is a **Server Component** — it calls
> `getMediaDetails` directly with no Server Action wrapper and no risk of leaking the
> TMDB token to the browser.
>
> The route is `/media/[type]/[id]`, **including `type`**, because TMDB uses separate
> namespaces for `/movie/{id}` and `/tv/{id}` — the same numeric id is a different title
> on each (`HANDOVER.md` §2.5). A `/media/[id]` route could not resolve Browse results,
> which have no database row to look the type up from.

**Copy and paste this prompt:**

> Task: Create the media detail page at `app/media/[type]/[id]/page.tsx`.
>
> 1. Create `app/media/[type]/[id]/page.tsx` as an **async Server Component**:
>    - Type props with the generated `PageProps<'/media/[type]/[id]'>` and
>      `const { type, id } = await props.params`. **Params are Promises in Next.js 16.**
>    - **Validate both.** `type` must be exactly `'movie'` or `'tv'`; `id` must parse to
>      a positive integer via `Number()` and `Number.isInteger`. If either fails, call
>      `notFound()` from `next/navigation`. Never pass `NaN` to TMDB.
>    - Call `getMediaDetails(id, type)` from `@/lib/tmdb`, **always passing `type`
>      explicitly** (the parameter defaults to `'movie'`, which would silently fetch the
>      wrong title for TV).
>    - Also read our own row: `select('*').eq('id', id).maybeSingle()` on `media`, so the
>      page knows the local `status`. A missing row is normal (Browse results) — handle
>      `null` without erroring.
>    - If TMDB returns `null`, render a short "Details unavailable" state. **Do not
>      crash, do not throw, and do not invent placeholder content.** The page must still
>      return HTTP 200 with no `TMDB_READ_ACCESS_TOKEN` set.
>    - Add `export const dynamic = 'force-dynamic'` for the same reason as `app/page.tsx`
>      — the TMDB fetch must not run at build time.
>    - Add `generateMetadata` returning the title so the browser tab and shared links
>      read sensibly.
>
> 2. Page content, mobile-first:
>    - Backdrop or poster, title, year, and a Movie/TV `Badge`.
>    - The overview text.
>    - Flatrate provider names as `Badge`s via `getFlatrateProviders(details)`. When any
>      are shown, include the line **"Streaming data provided by JustWatch"** (required
>      by TMDB's terms).
>    - If `getPrimaryTrailerKey(details)` returns a key, embed
>      `https://www.youtube.com/embed/{key}` in an `aspect-video w-full` wrapper with
>      `allowFullScreen`, `loading="lazy"`, and a `title` attribute for accessibility.
>    - A back link to `/`.
>
> 3. Create the Client Component `components/media/AddToWatchlistButton.tsx`:
>    - Props: `media: CardMedia`, `disabled?: boolean`.
>    - Calls the `addToWatchlist` action inside `useTransition`, inspects the returned
>      `{ ok, error }`, and shows `toast.success(...)` or `toast.error(...)` from
>      `sonner`. Disabled while pending.
>    - Render it on the detail page only when our `media` row is absent or its status is
>      not yet `watchlist`.
>
> 4. Update `components/media/MediaCard.tsx`:
>    - Wrap the poster and title in `<Link href={'/media/' + media.type + '/' + media.id}>`
>      from `next/link`, with an `aria-label` like `View details for {title}`.
>    - ⚠️ **Do not wrap the whole card in the Link** — the `voteControls` slot contains
>      buttons, and nesting interactive elements inside an anchor is invalid HTML and
>      breaks keyboard navigation. Link the poster and title only.
>    - The card stays a Server Component.
>
> Output the complete `app/media/[type]/[id]/page.tsx`,
> `components/media/AddToWatchlistButton.tsx`, and the updated `MediaCard.tsx`.

---

### Step 3.4: The Voting Backend `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Create the Server Actions for voting.
>
> Create `app/actions/votes.ts`.
>
> 1. Start with `'use server';`.
> 2. Import `createClient` from `@/lib/supabase/server` (async), `revalidatePath`, and
>    **`VoteValue`** from `@/types/database.types`.
> 3. `castVote(mediaId: number, voteValue: VoteValue)`
>    - Type the parameter as `VoteValue` (`2 | 1 | -1`). **Never `number`** — the column
>      has `check (vote_value in (2, 1, -1))`, so a wider type turns a compile-time error
>      into a runtime constraint violation.
>    - Require an authenticated user.
>    - **Upsert** into `votes` with `onConflict: 'media_id,user_id'` so re-voting
>      overwrites. That unique constraint already exists.
>    - Set `user_id` from the session — **never** accept it as a parameter. RLS enforces
>      `auth.uid() = user_id` regardless; this keeps the action honest.
>    - Return `{ ok: true }` or `{ ok: false; error: string }`.
> 4. Also export `clearVote(mediaId: number)`, deleting the caller's own vote row so a
>    user can undo. Same authenticated + typed-result pattern.
> 5. Call `revalidatePath('/')` after success.
>
> Output the complete `app/actions/votes.ts`.

---

### Step 3.5: The Watchlist Tab & Voting UI `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Render the Watchlist tab and add optimistic voting controls.
>
> 1. Create the Client Component `components/media/VoteControls.tsx`:
>    - Props: `mediaId: number`, `score: number`, `myVote: VoteValue | null`,
>      `breakdown: { displayName: string; voteValue: VoteValue }[]`,
>      `isGuest?: boolean`.
>    - **Use React `useOptimistic`** so the score updates instantly before the Server
>      Action resolves. This is a hard requirement from `CLAUDE.md` §3 — a plain `await`
>      plus `revalidatePath` round trip per click is not acceptable.
>    - Render three small buttons: **+2**, **+1**, **−1**. Highlight the one matching
>      `myVote`. Clicking the active one calls `clearVote`; otherwise `castVote`.
>    - On failure, revert the optimistic value and `toast.error(...)`.
>    - Render the total score as a button opening a shadcn `Dialog` that lists the
>      breakdown (e.g. "John: +2", "Jane: −1").
>    - If `isGuest` is true: **do not render** the three buttons (not merely disable —
>      nothing focusable and non-functional should remain in the tab order), still show
>      the score, and render it as plain text so the dialog cannot be opened.
>    - Keep tap targets comfortable; this is a mobile-first app.
>
> 2. Update `app/page.tsx` — the Watchlist tab only:
>    - `const supabase = await createClient()`.
>    - Select `media` rows where `status` is `'watchlist'` or `'currently_watching'`.
>    - Select the `votes` for those `media_id`s **joined to `profiles`** for
>      `display_name`, e.g. `.select('media_id, user_id, vote_value, profiles(display_name)')`.
>      `profiles` is readable under RLS. Type the join explicitly — no `any`.
>    - Sum `vote_value` per item. An item with **no votes scores `0`**; pass `undefined`
>      only when scores could not be loaded at all.
>    - Split into `pinned` (`currently_watching`) and `standard` (`watchlist`). Sort
>      `standard` by score descending with `title` ascending as a stable tie-breaker, so
>      ordering does not jitter between renders.
>    - Map rows through `fromDbRow(...)`, render with `MediaCard`, and pass
>      `<VoteControls />` into the `voteControls` slot.
>    - Render the existing empty state when there are no rows. Leave the Browse tab, the
>      Watched tab, and `export const dynamic = 'force-dynamic'` untouched.
>    - On Supabase error, render the empty state and `console.warn` — **do not throw**, so
>      a database hiccup cannot take down the page.
>
> Output the complete `VoteControls.tsx` and the updated `app/page.tsx`.

---

### Step 3.6: Search `[FUNCTIONAL]`

> **NEW IN v3 — this closes a real functional hole, not a nice-to-have.**
>
> `searchMedia()` has existed in `lib/tmdb.ts` since Phase 1.5 and **nothing calls it.**
> Without this step the only discovery path is the Browse tab's ~20 trending titles per
> week, so **you cannot add a specific film to the watchlist unless it happens to be
> trending.** For an app whose stated purpose is "discover, track, vote on and review"
> (PRD §1), that is a functional gap rather than polish.
>
> Implemented **inside the Browse tab** rather than as a separate `/search` route: it
> reuses the existing tab structure, the same `MediaCard` grid, and the same
> `fromTMDB()` adapter. `input` is already installed.

**Copy and paste this prompt:**

> Task: Add TMDB search to the Browse tab.
>
> 1. Create the Client Component `components/media/SearchBar.tsx`:
>    - A shadcn `Input` with a `Search` icon from `lucide-react` and an accessible label
>      (visually hidden is fine).
>    - ⚠️ **Drive it from the URL, not local state.** Use `useRouter` and
>      `useSearchParams` to read and write a `?q=` parameter. That keeps the results
>      server-rendered, makes a search shareable, and lets the back button work.
>    - **Debounce** URL updates by ~300 ms so typing does not fire a request per
>      keystroke, and use `router.replace` (not `push`) so each keystroke does not become
>      a separate history entry.
>    - Include a clear (`X`) button that removes `?q=` entirely.
>    - ⚠️ Do **not** import anything from `lib/tmdb.ts` other than pure helpers — this is
>      a Client Component and the TMDB token is not available there.
>
> 2. Update `app/page.tsx`:
>    - ⚠️ `searchParams` is a **Promise** in Next.js 16. Type the props with the generated
>      `PageProps<'/'>` and `const { q } = await props.searchParams`. **Do not hand-write
>      the props shape** — doing exactly that is what let the identical bug in
>      `app/login/page.tsx` pass `tsc` unnoticed.
>    - Normalise `q`: it is `string | string[] | undefined`, so take the first element if
>      an array, then `trim()`.
>    - In the Browse tab: when `q` is a non-empty string call `searchMedia(q)`; otherwise
>      call `getTrending()` as today. Render whichever result set through `fromTMDB()`
>      into the existing grid.
>    - Change the heading to reflect the mode — "Trending this week" versus
>      `Results for "…"` — and show the result count when searching.
>    - Distinguish the **two different empty states**, because conflating them is
>      misleading:
>      - a query that genuinely matched nothing → "No results for …"
>      - `searchMedia` returning `[]` because the token is missing or the request failed →
>        reuse the existing "No results from TMDB" state pointing at
>        `TMDB_READ_ACCESS_TOKEN`
>      `searchMedia` returns `[]` for both, so treat "empty **and** `q` was non-empty"
>      as the no-matches case and keep the token-missing copy for the non-search path.
>    - Keep `export const dynamic = 'force-dynamic'`. Leave the Watchlist and Watched
>      tabs untouched.
>    - Render `<SearchBar />` above the tabs so it is visible regardless of tab, but only
>      let it affect Browse.
>
> 3. Wrap `<SearchBar />` in `<Suspense>` — `useSearchParams` requires a Suspense
>    boundary during prerendering, and omitting it is a build-time error.
>
> Output the complete `SearchBar.tsx` and the updated `app/page.tsx`.

> **Note:** `searchMedia` already calls `/search/multi` and filters out `person` results,
> so actors will not appear as broken cards. It also already returns `[]` for a blank
> query, so no extra guard is needed.

---

## Phase 3 exit checklist

- [ ] `npm run build`, `npx tsc --noEmit`, `npx eslint .` all clean
- [ ] Clicking a poster navigates to `/media/movie/{id}`; the **back button** returns to
      the list (the main win over the old modal)
- [ ] `/media/tv/1399` shows a TV show, not the movie with id 1399 — proves `type` is
      threaded through
- [ ] `/media/bogus/1` and `/media/movie/-1` return 404, not a crash
- [ ] Voting feels instant (optimistic) and the score persists after refresh
- [ ] Re-adding an already-watched title does **not** reset its status to `watchlist`
- [ ] `removeFromWatchlist` refuses to delete anything carrying votes or reviews
- [ ] Searching a title that is **not** trending finds it and it can be added to the
      watchlist — the gap Step 3.6 exists to close
- [ ] `?q=` survives a refresh and the back button; clearing it restores trending
- [ ] "No results for X" and "No results from TMDB" are distinguishable states
- [ ] With `TMDB_READ_ACCESS_TOKEN` removed, both `/` and a detail page still return
      **HTTP 200** with empty states rather than 500 — the Phase 1.5 safety property
      must survive
