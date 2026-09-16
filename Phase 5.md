# Phase 5: Notifications & Guest View (Micro-Prompts) — REVISED v3

**Revision note (v3):** choosing a real detail page in Phase 3 **deleted an entire step**.
The old Step 5.3 existed only to fake a detail view by smuggling `?mediaId=` into the home
page and popping a modal — brittle, and it reproduced the live `searchParams` bug from
`app/login/page.tsx`. Notifications now link straight to `/media/[type]/[id]`. This phase
is shorter and lower-risk than v2.

---

## Instructions for the Developer

1. Paste the **House Rules** block from `Phase 3.md`, then the prompt for the current step.
2. Wait for it to generate the code and apply the changes.
3. Run `npm run build` to verify there are no errors.
4. Commit with **`git add -A && git commit -m "feat: phase 5.X complete"`**
   > ⚠️ Not `git commit -am` — `-a` skips new untracked files, and every step creates them.
5. Move on to the next step.

**Prerequisites:** Phases 3 and 4 complete; `popover` and `scroll-area` installed
(Phase 3, Step 3.0).

> **Note on RLS:** `notifications` is the one table guests cannot read at all —
> `0001_initial_schema.sql` grants `select` only `to authenticated` with
> `auth.uid() = user_id`, and there is no `anon` policy. That was an **inferred**
> decision, not one the PRD specified (`HANDOVER.md` §3). It aligns with Step 5.2 hiding
> the bell from guests, but if shared household notifications are ever wanted, the
> **policy** is what changes — not the UI.

---

### Step 5.1: Notifications Server Actions `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Create the Server Actions for fetching and managing notifications.
>
> Create `app/actions/notifications.ts`.
>
> 1. Start with `'use server';`. Import `createClient` from `@/lib/supabase/server`
>    (**async**), `revalidatePath`, and `Notification`, `Media` from
>    `@/types/database.types`.
> 2. Export
>    `interface NotificationWithMedia extends Notification { media: Pick<Media, 'title' | 'type'> | null }`.
>    Type the join explicitly — **`any` is banned** — and note `media` can be null.
>    ⚠️ The joined **`type`** is required so the bell can build a
>    `/media/[type]/[id]` link. `media_id` alone is ambiguous: TMDB's `/movie/{id}` and
>    `/tv/{id}` are separate namespaces (`HANDOVER.md` §2.5).
> 3. `getUserNotifications(): Promise<NotificationWithMedia[]>`
>    - Get the user via `supabase.auth.getUser()`. If there is **no** user, return `[]` —
>      **do not throw.** This runs from the Navbar on every route, including guest views;
>      a throw here would 500 the entire app for unauthenticated visitors.
>    - `.select('*, media(title, type)')`, ordered by `created_at` descending.
>    - RLS already restricts rows to the caller, but filter by `user_id = user.id`
>      explicitly so the intent is visible in the code.
>    - Add `.limit(50)` — an unbounded list grows forever. **Note the cap in a comment**
>      so it is not mistaken for completeness.
>    - On query error, `console.warn` and return `[]`.
> 4. `markNotificationAsRead(notificationId: string)` — set `is_read = true` for that id,
>    also constrained to `user_id = user.id`. RLS enforces it, but an explicit filter
>    stops a silent no-op looking like success.
> 5. `markAllNotificationsAsRead()` — set `is_read = true` for all of the caller's rows
>    where `is_read` is currently false.
> 6. Both mutations require an authenticated user, return the
>    `{ ok: true } | { ok: false; error: string }` shape from Phases 3–4, and call
>    `revalidatePath('/')` on success.
>
> Output the complete `app/actions/notifications.ts`.

---

### Step 5.2: The Notification Bell UI `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Build the notification bell and wire it into the Navbar.
>
> 1. Create the Client Component `components/layout/NotificationBell.tsx`:
>    - Props: `notifications: NotificationWithMedia[]`.
>    - ⚠️ **Accept the list as a prop — do not call `getUserNotifications()` in a
>      `useEffect` on mount.** Server Actions are sequential POSTs and the wrong channel
>      for reads. Fetching on the server also means the unread badge is correct on first
>      paint instead of flashing empty. `Navbar` is already a Server Component.
>    - Use shadcn `Popover`, `PopoverTrigger`, `PopoverContent` and `ScrollArea`.
>      ⚠️ This is **Base UI, not Radix** — pass the icon `Button` via the **`render`**
>      prop (`render={<Button … />}`), **not** `asChild`. See
>      `components/layout/Navbar.tsx` for the working pattern already in the repo.
>    - Trigger is the `Bell` icon from `lucide-react`. When any row has
>      `is_read === false`, overlay the unread count in a `Badge`, reusing the markup
>      already in `Navbar.tsx` — it currently renders from a hardcoded `unreadCount = 0`,
>      which this replaces.
>    - Give the trigger an `aria-label` including the count, e.g.
>      `Notifications (2 unread)`.
>    - Each row shows the `message`, the `media.title` (degrade gracefully when `media`
>      is null), and a formatted date.
>      ⚠️ **Do not call `new Date()` with no arguments at module scope.** Format from the
>      row's `created_at` inside the component, using an explicit fixed locale and
>      `timeZone: 'UTC'` — bare `toLocaleString()` differs between server and client and
>      causes hydration mismatches.
>    - Clicking a row calls `markNotificationAsRead(id)` and then navigates with
>      `useRouter().push('/media/' + n.media.type + '/' + n.media_id)`.
>      This is a **plain route** now — no query parameters, no modal state to coordinate.
>      Skip navigation (but still mark read) when `media` is null.
>    - Include a "Mark all as read" button at the top, shown only when unread rows exist.
>    - Render an explicit "No notifications" empty state.
>
> 2. Update `components/layout/Navbar.tsx`:
>    - Keep it a **Server Component**. Read the session with
>      `const supabase = await createClient()` and `supabase.auth.getUser()`.
>    - Authenticated: call `getUserNotifications()` and render
>      `<NotificationBell notifications={…} />`, replacing the placeholder bell and the
>      hardcoded `unreadCount`.
>    - Not authenticated: render **no** bell at all.
>    - Replace the "Guest" dropdown placeholder with the real `display_name` (or email),
>      turn the disabled "Sign in" item into a working link to `/login`, and offer
>      "Sign out" to signed-in users.
>    - ⚠️ **Degrade to the guest layout if the Supabase call fails.** The Navbar renders
>      on every route including `/login` and the detail pages — an unguarded throw here
>      500s the whole app. Phase 2 already regressed this once by asserting env vars
>      non-null; do not repeat it.
>
> Output the complete `NotificationBell.tsx` and the updated `Navbar.tsx`.

---

### ~~Step 5.3: Deep Linking the Detail Modal~~ — **REMOVED IN v3**

No longer needed. The old step read `?mediaId=` from the home page's `searchParams` and
auto-opened a modal, which meant:

- reproducing the Next.js 16 `searchParams`-is-a-Promise bug that already breaks
  `app/login/page.tsx`
- stripping the query string on close so refreshing didn't reopen the modal
- a modal that **could not open** for an item not on the currently selected tab — exactly
  the notification case

`/media/[type]/[id]` from Phase 3 Step 3.3 solves all three by being a real destination.
Nothing replaces this step; the work simply disappears.

> One consequence worth noting: with the modal gone, `app/page.tsx` no longer reads
> `searchParams` at all. **`app/login/page.tsx` remains the only place with the
> synchronous-`searchParams` bug**, and it still needs the Phase 3 prerequisite fix.

---

### Step 5.4: Guest Mode Lockdown `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Hide interactive controls from unauthenticated guests.
>
> Context: this is **defence in depth, not the security boundary.** RLS in
> `0001_initial_schema.sql` already prevents `anon` from writing anything — `votes`,
> `reviews` and `media` grant `anon` only `select`. Hiding the UI is for clarity, so
> guests aren't shown buttons that would fail. **Do not remove or weaken any RLS policy
> on the grounds that the UI now hides these controls.**
>
> 1. Update `app/page.tsx`:
>    - `const supabase = await createClient()`, then `supabase.auth.getUser()`.
>    - Derive `const isGuest = !user`. Treat an auth **error** as guest as well, and
>      `console.warn` rather than throwing — per PRD §3 guests are a supported audience
>      and must **never** be redirected to `/login`.
>    - Pass `isGuest` to `VoteControls`, and use it to decide whether to render the
>      "Mark Watched" trigger into `MediaCard`'s `actions` slot at all.
>
> 2. Update `app/media/[type]/[id]/page.tsx` the same way:
>    - Derive `isGuest` there too — **the detail page is directly reachable by URL**, so
>      it must not rely on the home page having done this check.
>    - When `isGuest`: omit `<AddToWatchlistButton />`, omit `<MediaActionsMenu />` (the
>      attendance three-dot menu), and pass `disabled` to `<ReviewForm />` so it renders
>      nothing. `<ReviewList />` still renders — guests can read reviews.
>
> 3. Confirm `components/media/VoteControls.tsx` (Phase 3, Step 3.5) behaves correctly
>    when `isGuest` is true:
>    - The +2 / +1 / −1 buttons are **not rendered** — not merely `disabled`, so nothing
>      focusable and non-functional is left in the tab order.
>    - The total score **remains visible**.
>    - The score is plain text rather than a button, so the vote-breakdown dialog cannot
>      be opened.
>
> 4. Add one quiet sign-in prompt for guests — e.g. a single line above the tabs reading
>    "Viewing as guest · Sign in to vote", linking to `/login`. **One prompt total**, not
>    a banner repeated on every card.
>
> Output the updated `app/page.tsx`, `app/media/[type]/[id]/page.tsx`, and
> `VoteControls.tsx`.

---

## Phase 5 exit checklist

- [ ] `npm run build`, `npx tsc --noEmit`, `npx eslint .` all clean
- [ ] Clicking a notification marks it read, navigates to the right detail page, and the
      unread badge decrements
- [ ] A notification for a **TV** show lands on `/media/tv/{id}`, not `/media/movie/{id}`
- [ ] The unread badge is correct on **first paint**, with no empty flash — proves the
      list is server-rendered rather than fetched on mount
- [ ] The **back button** from a notification returns to where you were
- [ ] **Logged out**, `/` returns **HTTP 200** with vote scores visible and no vote
      buttons — not a redirect to `/login` (PRD §3)
- [ ] **Logged out**, a detail page URL still loads and shows reviews, with no
      watchlist button, no review form, and no three-dot menu
- [ ] **Logged out**, no notification bell renders at all
- [ ] No hydration warnings from notification or review date formatting

---

## Still outstanding after Phase 5

Known gaps, tracked so they are not mistaken for done:

- **The PRD is still truncated.** Its §5 RLS policies were never supplied, so every
  policy in `0001_initial_schema.sql` remains inferred and unapproved
  (`HANDOVER.md` §3).
- **Migration `0003` adds columns to a PRD-specified table** (`reviews.created_at`,
  `reviews.reviewed_at`). That is a deliberate deviation from PRD §4, required by the
  dated-reviews requirement, and needs sign-off.
- **`middleware.ts` → `proxy.ts`** rename, if not done in the Phase 3 prerequisites.
- **`app/login/page.tsx`** still reads `searchParams` synchronously unless fixed — now
  the last remaining instance of that bug.
- **Two lockfiles.** `package-lock.json` resolves every package through
  `packages.atlassian.com` (an internal mirror, unusable off that network), while
  `yarn.lock` uses the public registry. Vercel currently builds via `yarn.lock` — **do
  not delete it** without first regenerating `package-lock.json` against the public
  registry, or deployments will break.
- **Node 20 vs 22.** `@supabase/supabase-js` warns that Node ≤20 is deprecated.
- **No test coverage anywhere.** The three places a regression would be silent: vote
  arithmetic, the house-average null handling, and the `was_present` default.
- **Search is not built.** `searchMedia()` exists in `lib/tmdb.ts` and is still unused —
  there is no search UI in any phase. `input` is installed and ready if you want one.
