# Context Handover — Movie Night App

**For:** the AI/developer continuing work in `git@github.com:hultqvist-sys/Movie-app.git`
(this repo is now the source of truth).

**From:** a prior session that built Phases 1 and 1.5, reviewed the Phase 2 work, and
revised the Phase 3–6 plans. Everything below was **verified by running it**, not inferred
from reading code. Where I'm uncertain, I say so.

**Read this alongside** `HANDOVER.md` (in the repo) and `Phase 3–6.md`.
⚠️ `HANDOVER.md` was written at the end of Phase 1.5 and **still says Phase 2 has not been
started.** It is stale. This document supersedes it where they conflict.

---

## 1. Current state

- Phases 1, 1.5 and 2 are complete. Phases 3–6 are planned but not started.
- The app is **deployed on Vercel and working**, with Supabase and TMDB credentials held
  in Vercel environment variables. Login works.
- Commits: `265d472` (squash of Phases 1 + 1.5), `51c2bf9` (Phase 2), `c071e04` (bug
  fixes). The tree at `265d472` is byte-identical to the other repo's Phase 1.5 HEAD.

### What Phase 2 added

`app/error.tsx`, `app/login/page.tsx`, `components/error-boundary.tsx`,
`components/providers.tsx`, `lib/supabase/client.ts`, `lib/supabase/server.ts`,
`middleware.ts`, plus edits to `app/layout.tsx` and `components/layout/Navbar.tsx`.

**The Phase 2 work is good.** It followed the handover document closely, kept the font fix
with a comment citing the right section, correctly did **not** redirect guests to `/login`
(per PRD §3), used `@supabase/ssr` properly with `getAll`/`setAll` and `await cookies()`,
and added the `ThemeProvider` that closed a gap I'd flagged. `next.config.ts`,
`app/page.tsx`, `lib/tmdb.ts` and the SQL migration were left untouched. No secrets are
committed.

The issues below are real but narrow, and mostly live in failure paths a working
deployment never hits.

---

## 2. Live defects — verified, with evidence

### 2.1 Missing env vars cause HTTP 500 on **every** route

All three Supabase files use non-null assertions:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```

`middleware.ts` matches `/((?!_next/static|_next/image|favicon.ico).*)` — effectively
everything. Supabase throws when handed `undefined`.

**Verified** by building and running with no env vars:

```
GET /       → 500
GET /login  → 500
Error: Your project's URL and Key are required to create a Supabase client!
```

With dummy credentials injected, both return 200 — so this is purely the missing-env path.

**Why it matters even though production is fine:** a new developer cloning the repo sees a
broken error page with no explanation; a renamed or deleted Vercel variable takes the whole
site down rather than degrading; preview deploys without the variables are dead.

**This is a regression.** Phase 1.5 deliberately returned **200 with a friendly empty
state** when credentials were absent, and that was verified live. Please restore it: guard
the env reads and degrade to the guest view rather than asserting non-null.

### 2.2 The login error message never renders

`app/login/page.tsx`:

```ts
}: { searchParams: { message?: string } }) {
  ...
  {searchParams.message && ( ... )}
```

In Next.js 16 `searchParams` is a **Promise**. The bundled docs at
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` type it
as `Promise<{ [key: string]: string | string[] | undefined }>`, and the generated
`PageProps` interface in `.next/types/routes.d.ts` confirms
`searchParams: Promise<Record<string, string | string[] | undefined>>`.

Hand-typing it as a plain object bypassed the generated type, so TypeScript could not
catch it.

**Verified:** loading `/login?message=TESTMSG` returns 200 and the page renders, but the
error `<p>` is **absent**. The only occurrences of `TESTMSG` in the response are inside
the RSC flight payload (`"q":"?message=TESTMSG"` — the router's URL encoding), not the
rendered DOM.

**Effect:** a wrong password shows the empty form again with no feedback. Successful login
works, which is why normal testing misses it.

**Fix:** `export default async function LoginPage(props: PageProps<'/login'>)` then
`const { message } = await props.searchParams`. **Use the generated `PageProps` type — do
not hand-write the props shape.** Same applies in `app/layout.tsx`, which replaced
`LayoutProps<"/">` with a manual type.

### 2.3 `middleware.ts` uses a convention deprecated in Next.js 16

Build output:

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
  npx @next/codemod@canary middleware-to-proxy .
```

The route table also now prints `ƒ Proxy (Middleware)`. It **works today** — warning only
— but will break on a future upgrade. Run the codemod.

> This one is my fault: the handover document told them to create `middleware.ts`. I
> checked the route-segment-config docs for breaking changes but missed the file rename.

### 2.4 Dead code plus an unnecessary dependency

`components/error-boundary.tsx` is **imported nowhere** (verified by grep across `app/` and
`components/`). It is the sole reason `react-error-boundary` was added to `package.json`.
`app/error.tsx` is the real boundary and is correct. Either wire the reusable one up or
delete both it and the dependency.

---

## 3. Environment and tooling traps

### 3.1 Two lockfiles, and one of them is load-bearing — ⚠️ do not "tidy" this

Both `package-lock.json` and `yarn.lock` are tracked, and they disagree.

**Verified:** `package-lock.json` contains **690** references to
`packages.atlassian.com/api/npm/npm-remote` and **zero** to the public npm registry:

```
"resolved": "https://packages.atlassian.com/api/npm/npm-remote/@babel/code-frame/-/code-frame-7.29.7.tgz"
```

That is an **internal corporate mirror, unreachable from Vercel or any outside machine.**
It happened because I ran the original `npm install` on a laptop configured to use it —
my error, inherited into this repo via the squash.

`yarn.lock` resolves through the public `registry.yarnpkg.com`. Vercel picks its package
manager from whichever lockfile it finds and prefers yarn, **so your deployments are
currently succeeding because of `yarn.lock`.**

> **Deleting `yarn.lock` will very likely break your Vercel builds.** I recommended exactly
> that earlier in the session and was wrong.

Also verified: `react-error-boundary` is in `yarn.lock` but **not** in
`package-lock.json`, so `npm ci` fails outright.

**Correct fix:** regenerate `package-lock.json` against the public registry, confirm it
resolves the same versions as `yarn.lock`, verify a build, and only then drop one of the
two. Until that's done, leave both alone.

Note: no credentials are in either lockfile — only hostnames. I scanned the full git
history for `_authToken`, `_password`, `service_role`, `SUPABASE_SERVICE`, `Bearer <token>`
and `eyJ` (the JWT prefix): **no real secrets in any commit.** The single `eyJ` hit is a
false positive inside a base64 checksum. The repo is public, so this was worth confirming.

### 3.2 `@types/node@^22.20.3` may fail to install for some people

Phase 2 bumped it. That version **is** real and is currently `latest` on npmjs.org, so
Vercel and normal machines are fine. It is **not** on the Atlassian mirror described
above, so anyone installing through that mirror gets `ETARGET`. If a contributor hits
this, pin `^20` — which is what the app actually runs on.

### 3.3 Node version

Local runtime is Node **20.18.0**. Several dependencies want `>=20.18.1`, and
`eslint-visitor-keys` wants `>=20.19.0`, so `npm install` prints `EBADENGINE`. Additionally
`@supabase/supabase-js` now prints on every build:

```
⚠️ Node.js 20 and below are deprecated and will no longer be supported in future
versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later.
```

Not urgent; worth planning.

### 3.4 Read the bundled Next.js docs, seriously

`AGENTS.md` (auto-generated by `next dev`) warns that Next.js 16 diverges from most
models' training data and points at `node_modules/next/dist/docs/`. **That is accurate and
it matters** — two of the three defects above are Next 16 breaking changes, and I only
found the `cacheComponents` issue in §4.1 by reading those docs. Check them before writing
routing, caching or file-convention code.

⚠️ `AGENTS.md` is no longer referenced from `CLAUDE.md`. Next.js originally wrote a
`CLAUDE.md` containing just `@AGENTS.md`; that got overwritten when the real instructions
file was moved in. Re-adding a line `@AGENTS.md` to `CLAUDE.md` would restore the pointer.
Next.js only ever rewrites `AGENTS.md`, never `CLAUDE.md`, so your instructions are safe.

---

## 4. Architectural decisions to respect

These are non-obvious and cheap to break by accident.

### 4.1 `export const dynamic = 'force-dynamic'` works — conditionally

`app/page.tsx` sets it, and it's required: without it Next.js prerenders the TMDB fetch at
build time, before `TMDB_READ_ACCESS_TOKEN` exists.

**In Next.js 16, `dynamic`, `dynamicParams`, `revalidate` and `fetchCache` are removed
when Cache Components is enabled.** From
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`:

> `v16.0.0` — `dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed when
> Cache Components is enabled.

It works for you **only because `cacheComponents` is opt-in and `next.config.ts` does not
set it.** If anyone enables it — or upgrades into a release where it becomes default —
**this export silently stops working** and builds will try to prerender TMDB again.
Migration path is the `use cache` directive plus `cacheLife`/`cacheTag`; see
`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`.

### 4.2 The font variable fix — do not rename it

`app/globals.css` (written by the shadcn CLI) maps the Tailwind tokens to `var(--font-sans)`:

```css
@theme inline {
  --font-sans: var(--font-sans);
  --font-heading: var(--font-sans);
}
```

but `create-next-app` scaffolds the font as `--font-geist-sans`. The result was that
`--font-sans` was never defined, `font-sans` on `<html>` and every `font-heading` resolved
to nothing, and the app silently fell back to the browser default while Geist was
downloaded and unused.

`app/layout.tsx` now correctly uses `variable: "--font-sans"`. **Rename it back, or
re-scaffold `layout.tsx` from a template, and typography breaks again — silently, with no
error.** `--font-geist-mono` is correct as-is; leave it.

### 4.3 `next.config.ts` image `remotePatterns`

`next/image` hard-errors on unconfigured remote hosts, so posters cannot render without:

```ts
images: {
  remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", port: "",
                     pathname: "/t/p/**", search: "" }],
}
```

Scoped to `/t/p/**` deliberately. All TMDB image sizes live under that path so it already
covers profile images and larger posters. **Any new CDN — Supabase Storage avatars, for
example — needs its own entry**, or `next/image` throws at request time.

Build URLs via `getPosterUrl()` from `lib/tmdb.ts` rather than hardcoding, so the host
stays in one place.

### 4.4 There is no shadcn `form` component, and it cannot be installed

`components.json` pins `"style": "base-nova"`, which is built on **`@base-ui/react`, not
Radix**. In that registry `form` is an **empty stub**:

```json
{ "$schema": "...", "name": "form", "type": "registry:ui" }
```

No files, no dependencies — so `npx shadcn@latest add form` **exits successfully and
writes nothing.** It fails silently. `components/ui/form.tsx` does not exist.

**Handle forms by** using Base UI's `Field` primitives directly, or Server Actions with
`useActionState` (often enough — mutations are Server Actions anyway). **Do not paste the
Radix `form.tsx` from the shadcn docs**: it imports `@radix-ui/react-label` and
`@radix-ui/react-slot`, neither of which is installed, and mixing Radix with Base UI
fights the theme tokens.

**Verified as available** in this style if you need them:
`checkbox`, `textarea`, `popover`, `scroll-area` — all return real files.

### 4.5 Base UI differs from Radix in ways that will bite you

- **No `asChild`.** Use the `render` prop with a `ReactElement`:
  `render={<Button variant="ghost" size="icon" />}`. There is a working example in
  `components/layout/Navbar.tsx`.
- `Tabs` maps `TabsTrigger` → `Tabs.Tab` and `TabsContent` → `Tabs.Panel` internally,
  though the exported names and `value` props behave as expected.
- `DropdownMenuLabel` maps to Base UI's `GroupLabel`, which expects a `Group` parent —
  wrap items in `DropdownMenuGroup`.
- `DropdownMenuContent` includes Portal and Positioner internally, and its popup defaults
  to `w-(--anchor-width)`. For an icon trigger that means a ~32px-wide menu unless you
  override with something like `className="w-48"`.
- **Button sizes are compact**: `default` is `h-8` (32px), `sm` `h-7`, `xs` `h-6` — all
  below the ~44px mobile tap-target guideline. Raise interactive controls explicitly.

### 4.6 `lib/tmdb.ts` never throws — please keep it that way

Missing token, non-2xx, network error and malformed JSON all funnel to `console.warn` plus
an empty result (`[]` for lists, `null` for details). **No mock data is ever substituted**,
so an empty result honestly means "nothing".

**Verified live:** with no token, HTTP 200 and
`[tmdb] TMDB_READ_ACCESS_TOKEN is not set — getTrending() returned no data`. With an
invalid token, HTTP 200 and `[tmdb] getTrending() failed: 401 Unauthorized`.

If you add a function that throws, the Browse tab starts crashing for anyone without a
`.env.local`. This is also the property Phase 2 regressed (§2.1).

### 4.7 `getMediaDetails(id, type = 'movie')` — the default is a trap

TMDB v3 has **no type-agnostic detail endpoint.** `/movie/{id}` and `/tv/{id}` are
separate namespaces and **the same numeric ID is a different title on each.** The original
spec asked for `getMediaDetails(id)`, so `type` defaults to `'movie'`.

Calling `getMediaDetails(123)` for a TV show returns the *movie* with ID 123, or `null`,
with no error. It looks like a TMDB data problem, not a bad call site.

**Always pass `type` explicitly** from the `media` row. `MediaType` in
`types/database.types.ts` and `TMDBMediaType` in `lib/tmdb.ts` are the same
`'movie' | 'tv'` union. Consider making the parameter required.

### 4.8 Other small things

- **`lib/utils.ts` is one line**: `export { cn } from "cn"`. That is the official
  first-party `cn` package (`github.com/shadcn-ui/cn`) replacing `clsx` +
  `tailwind-merge`, neither of which is installed. It looks like a typosquat and isn't —
  I checked the package metadata.
- **`components/ui/sonner.tsx` calls `useTheme()`** from `next-themes`. Phase 2 added the
  `ThemeProvider` in `components/providers.tsx`, so this now works properly. There is
  still **no user-facing theme toggle** — the app is effectively stuck on "system".
- **`shadcn@^4.21.0` is in `dependencies`**, not `devDependencies`. Cosmetic.

---

## 5. ⚠️ Schema and RLS — read before touching the database

### 5.1 `PRD.md` is truncated

It ends abruptly at **line 74**, inside the Section 5 code fence, with no closing fence and
no trailing newline (which is why `wc -l` reports 73):

```
for each row execute procedure public.handle_new_user();
```

Section 5 promises RLS policies — *"Claude must generate a SQL migration that includes the
following"* — and then **the policy SQL is simply absent.**

So in `supabase/migrations/0001_initial_schema.sql`:

- The **table schema** matches PRD §4 exactly, column for column.
- The **auth trigger** is copied **verbatim** from the PRD.
- The **RLS policies are inferred** from PRD §3's authenticated-vs-guest model. They were
  never specified and **have never been approved by the product owner.**

**Please get the complete Section 5 and reconcile it.** Everything below rests on guesses.

### 5.2 The inferred policy model

| Table | `anon` (guest) | `authenticated` (household) |
| --- | --- | --- |
| `profiles` | `SELECT` | `SELECT`; `UPDATE` own row only |
| `media` | `SELECT` | full CRUD, no ownership check |
| `votes` | `SELECT` | write only where `auth.uid() = user_id` |
| `reviews` | `SELECT` | write only where `auth.uid() = user_id` |
| `notifications` | **no access** | own rows only |

Two judgement calls worth a second opinion:

1. **`notifications` are fully private** — invisible to guests *and* to other household
   members. Defensible, but a guess.
2. **`profiles` has no `INSERT` policy on purpose.** Inserts happen only via
   `handle_new_user()`, which is `security definer` and bypasses RLS. Adding an insert
   policy is probably a mistake.

Additions beyond the PRD's literal text, all flagged in the SQL: `ON DELETE CASCADE` on
`profiles.id → auth.users`; `NOT NULL` + `CHECK` on `media.type` and `media.status`;
`DEFAULT 'watchlist'` on `media.status`; `notifications.message` left nullable; four
indexes. Note `CLAUDE.md` §4 says not to deviate from the PRD, so these need sign-off too.

### 5.3 Deleting a `media` row destroys history

`votes`, `reviews` **and** `notifications` all declare
`media_id … references public.media (id) on delete cascade`.

So "remove from watchlist", implemented as a delete, **silently and irreversibly destroys
every vote, review and notification** attached to that title. `media` is a single shared
table with a `status` column, so prefer a status change, or gate the hard delete behind a
confirmation that states exactly what will be lost.

### 5.4 The `reviews` RLS policy blocks the Phase 4 attendance feature

This is the one that will stop you. The policy is:

```sql
create policy "Members can write their own review"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = user_id);
```

The product requirement is that whoever marks something watched records **who else was
present**, which means inserting `reviews` rows with **other people's** `user_id`. That
fails this check — so tagging three people succeeds only for whoever clicked the button.

**Decision made and signed off by the product owner: use a `security definer` function**
so the fan-out happens in one trusted database routine, keeping RLS strict. The full
migration (`0002_watched_attendance.sql`) is written out in `Phase 4.md`, Step 4.0a.
Rejected alternatives: relaxing the policy (same cost, permanently weaker) and skipping the
pre-created rows (loses attendance entirely).

### 5.5 `reviews` has no timestamp column

**Verified:** the table has `id`, `media_id`, `user_id`, `star_rating`, `comment`,
`was_present` — and no date field of any kind. The PRD never specified one.

The requirement "show the date the review was left" therefore **cannot be built** without
a schema change. A plain `created_at` would also be *wrong*: under the agreed model a row
is created when someone is **tagged as present**, potentially days before they write
anything.

**Signed off:** migration `0003_review_timestamps.sql` (written out in `Phase 4.md`,
Step 4.0b) adds `created_at` (row creation) and `reviewed_at` (nullable, stamped once when
a rating or comment is first supplied, via trigger). Display `reviewed_at`.
`reviewed_at IS NULL` is also the clean test for "was present but hasn't reviewed".

⚠️ This **does add columns to a PRD-specified table**, a deliberate deviation from PRD §4.
Approved, but worth knowing.

### 5.6 `was_present` defaults to `true` — a silent data-corruption trap

The column is `not null default true`. The agreed model allows someone who **wasn't**
there to leave a review. If their row is inserted without stating otherwise, **the default
marks them as having attended** and your attendance data quietly becomes wrong, with no
error.

Always set `was_present` **explicitly**. Also: editing a review must never change
attendance, and toggling attendance must never wipe a review.

The three resulting states need no further schema change:
**no row** = hasn't engaged · **`true`** = was there · **`false`** = watched separately.

### 5.7 `types/database.types.ts` is hand-written

It exports `Database`, `Tables<'media'>`, `TablesInsert<'votes'>`, per-table
`Row`/`Insert`/`Update`, and the constraint-derived unions `MediaStatus`,
`VoteValue` (`2 | 1 | -1`) and `StarRating` (`1|2|3|4|5`).

**It mirrors the SQL file — if you change the schema, update both.** If you switch to
`supabase gen types`, verify those three unions survive: the generator emits plain
`number`/`string` for `CHECK` constraints, and you'd lose the type safety the PRD asks
for. `Functions` is currently `Record<string, never>` and needs the `mark_media_watched`
signature added once migration `0002` is applied.

---

## 6. Known functional gaps

- **There is no search.** `searchMedia()` exists in `lib/tmdb.ts` and **nothing calls
  it.** The only discovery path is the Browse tab's ~20 trending titles per week, so **you
  cannot add a specific film to the watchlist unless it happens to be trending.** For an
  app whose stated purpose is "discover, track, vote on and review" (PRD §1) this is a
  functional hole, not polish. A step for it is now specified in `Phase 3.md`, Step 3.6.
- **`MediaCard` cannot render database rows.** It is typed `media: TMDBMedia`, discriminated
  on `media_type`. The `media` table's rows use `type` instead and carry none of the TMDB
  fields, so the Watchlist and Watched tabs will not type-check against it. `Phase 3.md`
  Step 3.0 resolves this with a `CardMedia` adapter — do that before building those tabs.
- **No `app/not-found.tsx`.** Needed once the detail page calls `notFound()`.
- **No automated tests anywhere.** The three places a regression would be silent: vote
  arithmetic, house-average null handling, and the `was_present` default.

---

## 7. The plans

`Phase 3.md` through `Phase 6.md` (handed over separately) have been revised against the
real codebase. Notable points:

- They are **micro-prompts**, meant to be pasted one at a time. Each is self-contained,
  and `Phase 3.md` opens with a **House Rules** block to paste before each prompt —
  necessary because the AI receiving them has no memory of the constraints in §4.
- The detail view is a **real page** at `/media/[type]/[id]`, not a modal. The type is in
  the URL because of §4.7. This deleted a whole step from Phase 5 and removed the need for
  a Server Action wrapper around TMDB.
- Phases 3–5 are tagged `[FUNCTIONAL]`, Phase 6 is `[POLISH]`. `Phase 3.md` also carries a
  **"do not defer these"** list of seven items that look like UI but are architecture —
  optimistic voting, server/client boundaries, slots vs props, page-vs-modal,
  hydration-safe dates, guest controls removed rather than disabled, and accessible
  primitives.
- ⚠️ Every workflow block uses **`git add -A && git commit -m …`**, not `git commit -am`.
  The `-a` flag stages only *tracked* files and every step creates new ones, so `-am`
  would silently leave new components uncommitted.

---

## 8. Suggested first actions

1. Fix §2.1 (env-var 500s) — restores a guarantee that was verified working in Phase 1.5
2. Fix §2.2 (login `searchParams`) — one-line fix, currently user-visible
3. Run the `middleware` → `proxy` codemod (§2.3)
4. Resolve §2.4 (dead code and its dependency)
5. Get the real PRD §5 and reconcile the RLS policies (§5.1) — **before** adding `0002`
6. Regenerate `package-lock.json` against the public registry, **without** deleting
   `yarn.lock` until a build is verified (§3.1)
7. Refresh `HANDOVER.md`, which still claims Phase 2 hasn't started
8. Then start `Phase 3.md` at Step 3.0
