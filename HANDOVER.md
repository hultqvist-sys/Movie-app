# HANDOVER — Movie Night App

Bridge document between `PRD.md` (the spec) and this codebase (the reality).
Read this **and** `PRD.md` before writing code. Where they disagree, this file
describes what is actually on disk.

Last updated at commit `df31657`.

---

## 1. Current State

**Phase 1 (Schema) and Phase 1.5 (UI Shell + TMDB Services) are complete.**
**Phase 2 (Supabase Auth + Database wiring) has NOT been started.**

Concretely, that means:

- The SQL migration exists as a **file only**. It has never been applied to a
  Supabase project. No Supabase project is provisioned, and there are no
  credentials anywhere in the repo.
- There is **no Supabase client code at all** — no `lib/supabase/*`, no
  `middleware.ts`, no Server Actions, no auth. The packages are installed and
  nothing imports them.
- The UI reads **live TMDB data** in the Browse tab. Watchlist and Watched are
  hardcoded empty states.
- Every vote score in the UI is a placeholder (`—`), not a zero.

### Environment variables

No `.env.local` exists. You must create one. Nothing in the app will show real
data until you do:

```bash
TMDB_READ_ACCESS_TOKEN=        # TMDB v4 read access token (a long JWT)
NEXT_PUBLIC_SUPABASE_URL=      # Phase 2
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Phase 2
```

`TMDB_READ_ACCESS_TOKEN` is deliberately **not** `NEXT_PUBLIC_` prefixed.
Per `CLAUDE.md`, TMDB calls stay server-side. Do not expose it to the client.

### Verified state at handover

| Check | Result |
| --- | --- |
| `npm run build` | passes; `/` compiles as `ƒ (Dynamic)` |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| Runtime, no TMDB token | HTTP 200, empty state, warning logged — does not crash |
| Runtime, invalid TMDB token | HTTP 200, empty state, `401` logged — does not crash |

The last two were verified against a running `next start`, not inferred.

### Versions

Node `v20.18.0` · npm `10.8.2` · Next `16.3.5` · React `19.2.8` ·
Tailwind `4.3.3` · TypeScript `5.9.3` · shadcn CLI `4.21.0` ·
`@base-ui/react` `1.8.0` · `@supabase/ssr` `0.12.7`

> **Note:** several dependencies want Node `>=20.18.1` (and `eslint-visitor-keys`
> wants `>=20.19.0`). We are on `20.18.0`, so `npm install` prints `EBADENGINE`
> warnings. Harmless so far, but a patch bump clears them.

---

## 2. Architecture Decisions & Quirks

These are non-obvious. Please respect them or change them deliberately.

### 2.1 Next.js 16 cache semantics — `force-dynamic` works, but is conditional

`app/page.tsx` sets:

```ts
export const dynamic = "force-dynamic";
```

This is required: without it, Next.js tries to run the TMDB fetch while
prerendering at build time, before `TMDB_READ_ACCESS_TOKEN` exists in the
deploy environment.

**The warning:** in Next.js 16, `dynamic`, `dynamicParams`, `revalidate`, and
`fetchCache` are **removed when Cache Components is enabled.** Source, bundled
in this repo:

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`

> `v16.0.0` — `dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed
> when Cache Components is enabled.

It works for us **only because `cacheComponents` is opt-in and we have not
enabled it.** Check `next.config.ts`: there is no `cacheComponents: true`.

If you (or a future AI) enable `cacheComponents`, or upgrade into a release
where it becomes the default, **this export silently stops doing its job** and
the build will try to prerender the TMDB fetch again. The migration path is the
`use cache` directive plus `cacheLife`/`cacheTag` — see
`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`.

Related: `experimental_ppr` was also removed in v16.

### 2.2 Next.js 16 font CSS variable fix — do not revert

There is a **mismatch between `create-next-app` 16 and the shadcn CLI**, which
we fixed in `app/layout.tsx`.

`app/globals.css` (written by `shadcn init`) maps the Tailwind tokens like this:

```css
@theme inline {
  --font-sans: var(--font-sans);
  --font-heading: var(--font-sans);
}
```

But `create-next-app` scaffolds the font under a *different* variable name:

```ts
const geistSans = Geist({ variable: "--font-geist-sans" }); // original
```

So `--font-sans` was never defined, `font-sans` (applied to `<html>` in
`globals.css`) and every `font-heading` resolved to nothing, and the app fell
back to the browser default font while Geist was downloaded and unused.

**The fix now in `app/layout.tsx`:**

```ts
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
```

If you rename that variable back, or re-scaffold `layout.tsx` from a template,
typography breaks again — and it breaks *silently*, because nothing errors.
`--font-geist-mono` is still correct and matches `globals.css`; leave it.

### 2.3 `next.config.ts` — TMDB image `remotePatterns`

`next/image` hard-errors on unconfigured remote hosts, so posters cannot render
without this. Added in `next.config.ts`:

```ts
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "image.tmdb.org",
      port: "",
      pathname: "/t/p/**",
      search: "",
    },
  ],
}
```

Deliberately scoped to the `/t/p/**` image-delivery path rather than the whole
host. If you start pulling TMDB **profile** images or other sizes they still sit
under `/t/p/`, so this pattern already covers them — no change needed. If you
add a different CDN (avatars from Supabase Storage, for example) you must add
another entry or `next/image` will throw at request time.

`lib/tmdb.ts` exports `TMDB_IMAGE_BASE` and `TMDB_POSTER_SIZE` — build URLs via
`getPosterUrl()` rather than hardcoding, so the host stays in one place.

### 2.4 The shadcn `form` component does not exist in our style — plan around it

`components.json` pins `"style": "base-nova"`, which is built on
**`@base-ui/react`, not Radix**. In that registry, `form` is an **empty stub**:

```json
{ "$schema": "...", "name": "form", "type": "registry:ui" }
```

No files, no dependencies. `npx shadcn@latest add form` therefore **exits
successfully and writes nothing** — it fails silently. `components/ui/form.tsx`
does not exist and cannot be installed. (The older Radix-based `new-york` style
still ships the real `react-hook-form` wrapper; ours does not.)

**How to handle forms going forward — pick one, don't mix:**

1. **Preferred: Base UI `Field` primitives.** Consistent with every other
   installed component. Use `@base-ui/react/field` directly for labels,
   validation messages, and error state.
2. **Server Actions with `useActionState`.** Per `CLAUDE.md`, mutations are
   Server Actions anyway. For the review/vote forms you may not need a client
   form library at all — progressive enhancement via `<form action={...}>` plus
   `useActionState` for pending/error state is often enough.
3. **Last resort: install `react-hook-form` + `zod` yourself** and hand-write
   the wrapper. Do **not** copy the Radix `form.tsx` from the shadcn docs — it
   imports `@radix-ui/react-label` and `@radix-ui/react-slot`, neither of which
   is installed, and mixing Radix with Base UI will fight our theme tokens.

Also note for anyone used to Radix-era shadcn: **Base UI has no `asChild`.** It
uses a `render` prop taking a `ReactElement`. See the avatar trigger in
`components/layout/Navbar.tsx` for a working example. And `Tabs` maps
`TabsTrigger` → `Tabs.Tab` and `TabsContent` → `Tabs.Panel` internally, though
the exported names and `value` props behave as you'd expect.

Installed: `card dialog tabs dropdown-menu avatar badge skeleton input label
sonner button`. Missing vs. the original request: `form` only.

### 2.5 `getMediaDetails(id, type = 'movie')` — the default is a real trap

```ts
export async function getMediaDetails(
  id: number,
  type: TMDBMediaType = 'movie'
): Promise<TMDBMediaDetails | null>
```

TMDB v3 has **no type-agnostic detail endpoint.** `/movie/{id}` and `/tv/{id}`
are separate namespaces, and **the same numeric ID refers to different titles on
each.** The original spec called for `getMediaDetails(id)`, so `type` defaults to
`'movie'` to keep that call shape valid.

**Consequence:** calling `getMediaDetails(123)` for a TV show returns the
*movie* with ID 123 — or `null` — with no error and no warning. It will look
like a TMDB data problem, not a bug in your call site.

**Always pass the type explicitly** from the `type` column on the `media` row:

```ts
const details = await getMediaDetails(media.id, media.type); // do this
```

`MediaType` in `types/database.types.ts` and `TMDBMediaType` in `lib/tmdb.ts`
are the same `'movie' | 'tv'` union, so they interoperate directly. Consider
making `type` a required parameter once no caller depends on the default.

### 2.6 TMDB service safety contract — preserve it

`lib/tmdb.ts` **never throws.** Missing token, non-2xx, network error, and
malformed JSON all funnel to `console.warn` plus an empty result (`[]` for
lists, `null` for details). This is what lets the app build and run before
credentials exist.

**No mock or placeholder data is ever substituted** — an empty result means
"genuinely nothing", so empty states are honest. Please keep both properties
when you extend this file. If you add a function that throws, the Browse tab
starts crashing for anyone without a `.env.local`.

`getTrending()` hits `/trending/all/week` and filters out `media_type: 'person'`
results, so Browse mixes movies and TV as the PRD intends.

### 2.7 Other small things

- **`lib/utils.ts` is `export { cn } from "cn"`.** That is the official
  first-party `cn` package (`github.com/shadcn-ui/cn`), replacing
  `clsx` + `tailwind-merge`. Neither of those is installed. It looks like a
  typosquat and is not.
- **`components/ui/sonner.tsx` calls `useTheme()` from `next-themes`, and there
  is no `ThemeProvider`.** It degrades to `"system"` and does not crash
  (verified). If you add a dark-mode toggle you must add the provider.
- **`AGENTS.md` is generated and re-added by `next dev`.** It carries a real
  warning: Next.js 16 diverges from most models' training data, and the bundled
  docs in `node_modules/next/dist/docs/` are the authority. Reading them is how
  the `cacheComponents` issue in §2.1 was found. `CLAUDE.md` currently does
  **not** reference it; adding a line `@AGENTS.md` would restore that pointer.
  Next.js only rewrites `AGENTS.md`, never your `CLAUDE.md`.
- **`shadcn@^4.21.0` is in `dependencies`**, not `devDependencies`. Cosmetic.

---

## 3. ⚠️ Open Spec Issue — read before touching RLS

**`PRD.md` in this repo is truncated.** It ends abruptly at line 74, inside the
Section 5 code fence, with no closing ``` and no trailing newline (which is why
`wc -l` reports 73):

```
for each row execute procedure public.handle_new_user();
```

Section 5 promises RLS policies ("Claude must generate a SQL migration that
includes the following") and then **the policy SQL is simply absent.**

What this means for `supabase/migrations/0001_initial_schema.sql`:

- The **table schema** matches PRD Section 4 exactly, column for column.
- The **auth trigger** is copied **verbatim** from the PRD.
- The **RLS policies are inferred**, derived from PRD Section 3's
  authenticated-vs-guest model. They were never specified. **They are not
  approved by the product owner.**

The inferred model, all commented as such in the SQL:

| Table | `anon` (guest) | `authenticated` (household) |
| --- | --- | --- |
| `profiles` | `SELECT` | `SELECT`; `UPDATE` own row only |
| `media` | `SELECT` | full CRUD, no ownership check |
| `votes` | `SELECT` | write only where `auth.uid() = user_id` |
| `reviews` | `SELECT` | write only where `auth.uid() = user_id` |
| `notifications` | **no access** | own rows only |

Two judgement calls worth a second opinion:

1. **`notifications` are fully private** — invisible to guests *and* to other
   household members. Defensible, but it was a guess.
2. **`profiles` has no `INSERT` policy on purpose.** Inserts happen only via
   `handle_new_user()`, which is `security definer` and bypasses RLS. Adding an
   insert policy is probably a mistake.

Additions beyond the PRD's literal text (all additive, all flagged in the SQL):
`ON DELETE CASCADE` on `profiles.id → auth.users`; `NOT NULL` + `CHECK` on
`media.type` and `media.status`; `DEFAULT 'watchlist'` on `media.status`;
`notifications.message` left nullable; four indexes.

**Action for the next developer: get the complete Section 5 from the product
owner and reconcile it before applying this migration to a real project.**
Note that `CLAUDE.md` §4 says "do not deviate from the table schemas or auth
rules defined in `PRD.md`" — so the additions above need sign-off too.

---

## 4. Pending Tasks (Phase 2)

In dependency order. Constraints from `CLAUDE.md` are restated inline because
they are easy to violate.

### 4.1 Provision Supabase and apply the migration

1. Create the Supabase project.
2. **Reconcile the RLS policies first** — see Section 3 above.
3. Apply `supabase/migrations/0001_initial_schema.sql`.
4. **Disable email signups** in the dashboard (PRD §3: signups are closed).
5. Invite the 3 household members manually via the Admin dashboard.
6. Populate `.env.local` with the project URL and anon key.

### 4.2 Set up the Supabase clients (`@supabase/ssr`)

Create the standard trio. Use `@supabase/ssr` only — **not**
`@supabase/auth-helpers-nextjs`, which is deprecated.

- `lib/supabase/client.ts` — browser client via `createBrowserClient`
- `lib/supabase/server.ts` — RSC/Server Action client via `createServerClient`,
  wired to `cookies()` from `next/headers`
- `lib/supabase/middleware.ts` — session-refresh helper for the middleware

Type every client with the existing `Database` interface:

```ts
import type { Database } from "@/types/database.types";
createServerClient<Database>(url, key, { cookies: ... });
```

`types/database.types.ts` is hand-written and already exports `Database`,
`Tables<'media'>`, `TablesInsert<'votes'>`, and per-table `Row`/`Insert`/`Update`
types. It mirrors the SQL file — **if you change the schema, update both.** If
you later switch to `supabase gen types`, verify the `CHECK`-constraint unions
(`MediaStatus`, `VoteValue`, `StarRating`) survive; the generator emits plain
`number`/`string` for those and you will lose type safety the PRD asks for.

Note `cookies()` is async in Next.js 15+; check the bundled docs rather than
assuming the older synchronous signature.

### 4.3 Auth middleware

Create `middleware.ts` in the root. Per PRD §3:

- Refresh the Supabase session on every matched request.
- Authenticated users → the standard app.
- Unauthenticated users → **read-only guest view, not a redirect to login.**
  Guests are a supported audience; do not lock them out. Mutations must be
  hidden or disabled, and the RLS policies enforce this server-side regardless.
- Use a `matcher` that excludes `_next/static`, `_next/image`, and favicon.

### 4.4 Login UI

- A minimal sign-in route (email + password, or magic link).
- **Do not build a public signup flow** — `CLAUDE.md` §4 and PRD §3 are explicit
  that provisioning is manual via the Admin dashboard.
- Remember §2.4: there is no shadcn `form` component. `input`, `label`, and
  `button` are installed and ready.
- Wire the real session into `components/layout/Navbar.tsx`, replacing the
  `Guest` placeholder, the disabled menu items, and the hardcoded
  `unreadCount = 0`. Both `TODO(phase-2)` markers are in that file.

### 4.5 Then, per PRD

Voting logic with `useOptimistic`, the watchlist/watched queries behind those
two empty-state tabs, reviews, and notifications.

Reminders that are easy to get wrong:

- Mutations are **Server Actions + `revalidatePath`**. **No Supabase Realtime**
  — the PRD rules it out for the MVP explicitly.
- Voting must use **optimistic UI** (`useOptimistic`) so it feels instant.
- **`app/error.tsx` does not exist yet.** `CLAUDE.md` §3 requires error
  boundaries plus Sonner toasts for failures. `<Toaster />` is already mounted
  in `app/layout.tsx`; the boundary still needs writing.
- Mobile-first layout. `MediaCard` accepts an optional `voteScore` and renders
  `—` when it is `undefined`, so pass real aggregates rather than defaulting
  to `0` — a real zero and "not loaded" must stay visually distinct.
- Run `npm run build` or `npx tsc --noEmit` after each feature. Strict
  TypeScript, and **never `any`**.

---

## 5. File Map

```
app/
  layout.tsx          Navbar + <Toaster />; font variable fix (§2.2)
  page.tsx            Tabs: Browse (live TMDB) / Watchlist / Watched (stubs)
  globals.css         Tailwind v4 + shadcn tokens; expects --font-sans (§2.2)
components/
  layout/Navbar.tsx   Title, bell, avatar menu — all placeholders (§4.4)
  media/MediaCard.tsx Poster, title, year, vote-score placeholder
  ui/                 shadcn base-nova components; no form.tsx (§2.4)
lib/
  tmdb.ts             TMDB client + types + helpers; never throws (§2.6)
  utils.ts            re-exports cn from the `cn` package (§2.7)
supabase/
  migrations/0001_initial_schema.sql   Not yet applied; RLS inferred (§3)
types/
  database.types.ts   Hand-written; exports Database for the SSR clients
next.config.ts        TMDB image remotePatterns (§2.3)
components.json       style: base-nova (Base UI, not Radix)
PRD.md                TRUNCATED at line 73 (§3)
CLAUDE.md             Project rules for AI assistants
AGENTS.md             Generated by next dev; Next.js 16 docs pointer
```

Nothing exists yet for: `middleware.ts`, `lib/supabase/*`, `app/error.tsx`,
`app/login/*`, or any Server Action.
