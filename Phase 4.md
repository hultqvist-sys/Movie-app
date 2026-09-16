# Phase 4: History, Ratings, and Comments (Micro-Prompts) — REVISED v3

**Revision note (v3):** folds in your attendance model — the person marking something
watched records who was there; everyone gets an optional review; anyone can correct their
own attendance afterwards via a three-dot menu. That surfaced a **second blocking schema
gap**: `reviews` has no date column, so "date the review was left" cannot be displayed
today. Both migrations are in Step 4.0.

---

## ⚠️ Step 4.0: BLOCKING — two migrations to approve before any prompt below

### 4.0a — The attendance fan-out vs. RLS

v1 of this plan asked `markMediaAsWatched` to insert a `reviews` row for **every** person
present. Our migration contains:

```sql
create policy "Members can write their own review"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = user_id);
```

A row whose `user_id` is anyone **other than the caller** fails that check — so tagging
three people would succeed only for whoever clicked the button. This is the gap left by
the **truncated PRD §5** (`HANDOVER.md` §3) forcing a decision.

**Decision taken: Option A — a `security definer` function.** The fan-out happens inside
one trusted database routine, so RLS stays strict and members still cannot forge reviews
as each other through the API. Rejected alternatives: relaxing the policy (permanently
weaker for a one-off convenience, same migration cost) and skipping the pre-created rows
(loses attendance entirely, which your model explicitly needs).

**Create `supabase/migrations/0002_watched_attendance.sql`:**

```sql
-- Marks a media item watched, records attendance, and notifies attendees.
-- SECURITY DEFINER so it can write reviews/notifications rows for other household
-- members, which the table RLS policies deliberately forbid via the API.
-- Callers are still verified: must be authenticated AND have a profiles row.
create or replace function public.mark_media_watched(
  p_media_id int,
  p_present_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_title  text;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'Not a household member';
  end if;

  update public.media
     set status = 'watched'
   where id = p_media_id
  returning title into v_title;

  if v_title is null then
    raise exception 'Media % not found', p_media_id;
  end if;

  -- Attendance rows. ON CONFLICT preserves any rating/comment already written.
  insert into public.reviews (media_id, user_id, was_present)
  select p_media_id, u, true
    from unnest(p_present_user_ids) as u
   where exists (select 1 from public.profiles p where p.id = u)
      on conflict (media_id, user_id) do update set was_present = true;

  -- Notify everyone present except whoever clicked the button.
  insert into public.notifications (user_id, media_id, message)
  select u, p_media_id, v_title || ' was marked as watched. Tap to leave a review!'
    from unnest(p_present_user_ids) as u
   where u <> v_caller
     and exists (select 1 from public.profiles p where p.id = u);
end;
$$;

revoke all on function public.mark_media_watched(int, uuid[]) from public, anon;
grant execute on function public.mark_media_watched(int, uuid[]) to authenticated;
```

### 4.0b — `reviews` has no date column (new blocker)

Your requirement *"date the review was left"* **cannot be built today.** The table is:

```sql
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  media_id int not null references public.media (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  star_rating int check (star_rating between 1 and 5),
  comment text,
  was_present boolean not null default true,
  unique (media_id, user_id)
);
```

No timestamp of any kind — and the PRD never specified one, so this is a genuine gap in
the original spec rather than something we dropped.

**A plain `created_at` would be wrong here.** Under your model a row is created the moment
someone is *tagged as present*, which can be days before they write anything. `created_at`
would show the tagging date, not the review date. So we need **two** columns:

| Column | Meaning |
|---|---|
| `created_at` | when the row appeared (tagged, or self-created) |
| `reviewed_at` | when a rating or comment was **first** supplied — `null` until then |

`reviewed_at` is what you display. `reviewed_at IS NULL` is also the clean test for
"was present but hasn't reviewed yet".

**Create `supabase/migrations/0003_review_timestamps.sql`:**

```sql
alter table public.reviews
  add column created_at  timestamptz not null default now(),
  add column reviewed_at timestamptz;

-- Stamp reviewed_at the first time a rating or comment is supplied, and never move it
-- afterwards, so later edits do not rewrite history.
create or replace function public.touch_reviewed_at()
returns trigger
language plpgsql
as $$
begin
  if new.star_rating is not null or new.comment is not null then
    if tg_op = 'INSERT' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
    elsif old.reviewed_at is null then
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger reviews_touch_reviewed_at
  before insert or update on public.reviews
  for each row execute function public.touch_reviewed_at();
```

> **Sign-off needed on all of this:**
> 1. `0001`'s RLS policies were **inferred, not specified** — still unapproved.
> 2. `0002` adds a function, not a table, so it does not contradict PRD §4 — but
>    `CLAUDE.md` §4 forbids deviating from the PRD's auth rules, so it needs approval.
> 3. `0003` **does add columns to a PRD-specified table.** That is a direct deviation
>    from PRD §4 and needs explicit approval. Your dated-reviews requirement cannot be
>    met without it.

### 4.0c — The `was_present` default is a trap

The column is `not null default true`. Your model allows someone who **wasn't** there to
leave a review. If the app inserts their row without stating otherwise, the default
silently marks them **present** and your attendance data quietly becomes wrong — with no
error. Every prompt below therefore sets `was_present` **explicitly**.

Resulting three states, with no further schema change needed:

- **no row** → hasn't engaged
- **`was_present = true`** → was there (reviewed or not)
- **`was_present = false`** → watched separately; may or may not have reviewed

---

## Instructions for the Developer

1. Paste the **House Rules** block from `Phase 3.md`, then the prompt for the current step.
2. Wait for it to generate the code and apply the changes.
3. Run `npm run build` to verify there are no errors.
4. Commit with **`git add -A && git commit -m "feat: phase 4.X complete"`**
   > ⚠️ Not `git commit -am` — `-a` skips new untracked files, and every step creates them.
5. Move on to the next step.

**Prerequisites:** Phase 3 complete (including the `/media/[type]/[id]` page);
`checkbox` and `textarea` installed; migrations `0002` and `0003` applied.

---

### Step 4.1: Reviews, Attendance & History Server Actions `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Create the Server Actions for marking watched, reviewing, and attendance.
>
> Create `app/actions/reviews.ts`.
>
> 1. Start with `'use server';`. Import `createClient` from `@/lib/supabase/server`
>    (**async**), `revalidatePath`, and `Profile`, `Review`, `StarRating` from
>    `@/types/database.types`.
> 2. Reuse the `requireUser()` + `{ ok: true } | { ok: false; error: string }` pattern
>    from Phase 3.
> 3. `getHouseholdProfiles(): Promise<Profile[]>`
>    - Select all `profiles`, ordered by `display_name`.
>    - On error, `console.warn` and return `[]` — **never throw**, so a failed query
>      cannot break the modal that calls it.
> 4. `markMediaAsWatched(mediaId: number, presentUserIds: string[])`
>    - Require an authenticated user.
>    - ⚠️ **Do not insert `reviews` or `notifications` rows directly.** RLS is
>      `with check (auth.uid() = user_id)`, so writing rows for other users fails. Call
>      the migration `0002` function instead:
>      ```ts
>      const { error } = await supabase.rpc('mark_media_watched', {
>        p_media_id: mediaId,
>        p_present_user_ids: presentUserIds,
>      })
>      ```
>    - It sets `status: 'watched'`, upserts attendance rows, and notifies everyone
>      present except the caller — atomically.
>    - `types/database.types.ts` is hand-written, so add this function's signature to the
>      `Functions` key of the `Database` interface (currently `Record<string, never>`) to
>      type the `rpc` call. **No `any`.**
> 5. `upsertReview(mediaId: number, starRating: StarRating | null, comment: string | null)`
>    - Type the rating as **`StarRating`**, not `number` — the column has
>      `check (star_rating between 1 and 5)`.
>    - Use a real **`.upsert(..., { onConflict: 'media_id,user_id' })`**, not `.update()`.
>      A plain update affects **zero rows** when the user was never tagged present, so
>      their review would vanish with no error — and your model explicitly allows people
>      who weren't there to review.
>    - ⚠️ On **insert**, set `was_present: false` **explicitly**. The column defaults to
>      `true`, so omitting it would wrongly record a non-attendee as having attended.
>    - ⚠️ On **conflict**, do **not** touch `was_present` — it may have been set by the
>      tagging flow or by the user's own attendance toggle. Editing a review must never
>      silently change attendance.
>    - Set `user_id` from the session, never from a parameter.
>    - Treat an empty-string comment as `null`.
>    - Do not set `reviewed_at`; the migration `0003` trigger stamps it once, on the
>      first rating or comment.
> 6. `setAttendance(mediaId: number, wasPresent: boolean)`
>    - This powers the three-dot menu in Step 4.5 ("Mark as attended" / "Remove
>      attendance mark").
>    - Upsert the **caller's own** row with `onConflict: 'media_id,user_id'`, setting only
>      `was_present`. Allowed by existing RLS — it is the caller's own row, so no
>      `security definer` function is needed here.
>    - ⚠️ Must **not** clear `star_rating`, `comment`, or `reviewed_at`. Someone toggling
>      attendance after reviewing must keep their review intact.
>    - Creating a row with no review is valid: that is "I was there, no review".
> 7. Call `revalidatePath('/')` and `revalidatePath('/media/[type]/[id]', 'page')` after
>    each successful mutation, since reviews now render on the detail page.
>
> Output the complete `app/actions/reviews.ts`.

---

### Step 4.2: The "Mark as Watched" Tagging UI `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Build the modal for tagging who was present.
>
> 1. Create the Client Component `components/media/MarkWatchedModal.tsx`:
>    - Props: `isOpen: boolean`, `onClose: () => void`, `mediaId: number`,
>      `profiles: Profile[]`, `currentUserId: string`.
>    - ⚠️ **Accept `profiles` as a prop — do not call `getHouseholdProfiles()` on mount.**
>      Server Actions are sequential POSTs and a poor read channel; fetch once on the
>      server and pass down.
>    - Use shadcn `Dialog` plus `Checkbox` and `Label` — one row per profile showing
>      `display_name`, falling back to "Unknown member" (the column is nullable).
>    - Default the current user's checkbox to **checked**.
>    - Associate each `Checkbox` with its `Label` via `htmlFor`/`id` so the whole row is
>      tappable on mobile.
>    - Disable submit when nobody is selected.
>    - On submit call `markMediaAsWatched(mediaId, selectedIds)` inside `useTransition`,
>      toast on either outcome, and close **only on success** so a failure does not lose
>      the selection.
>
> 2. Render a "Mark Watched" trigger plus this modal into `MediaCard`'s existing
>    `actions` slot from `app/page.tsx`, for items whose `status` is `'watchlist'` or
>    `'currently_watching'`. Never for `'watched'` items, and never for guests.
>    **Do not add new props to `MediaCard`** — use the slot.
>
> 3. In `app/page.tsx`, fetch `getHouseholdProfiles()` and the current user once and
>    pass them down.
>
> Output the complete `MarkWatchedModal.tsx` and the updated `app/page.tsx`.

---

### Step 4.3: The Review List & Rating Form `[FUNCTIONAL]`

> **CHANGED IN v3.** This lives on the `/media/[type]/[id]` **page** from Step 3.3, not a
> modal. Your display spec: avatar, attendance mark, date the review was left, then the
> review as plain text.

**Copy and paste this prompt:**

> Task: Add the review list and rating form to the media detail page.
>
> 1. Create `components/media/ReviewList.tsx` as a **Server Component**:
>    - Props: `reviews: ReviewWithProfile[]`.
>    - Export
>      `interface ReviewWithProfile extends Review { profiles: Pick<Profile, 'display_name' | 'avatar_url'> | null }`.
>      Type the join explicitly — Supabase returns a nested object and **`any` is banned**.
>      Note `profiles` can be null.
>    - Render each entry with, in this order:
>      1. `Avatar` + `AvatarImage` (from `avatar_url`) + `AvatarFallback` (initials, or a
>         `User` icon when `display_name` is null)
>      2. The member's name
>      3. An **attendance mark** — a `Badge` reading "Attended" when
>         `was_present === true`, or "Watched separately" when `false`
>      4. The **date the review was left**, formatted from **`reviewed_at`** (not
>         `created_at` — see Step 4.0b; `created_at` is when they were tagged)
>      5. The star rating, shown **only** when `star_rating` is not null
>      6. The comment, rendered as **plain text**
>    - ⚠️ Render the comment as plain text only. Do **not** use `dangerouslySetInnerHTML`
>      or any markdown renderer — this is untrusted user input.
>    - ⚠️ **Skip rows that have nothing to show**: `reviewed_at === null` **and**
>      `was_present === false` means someone toggled attendance off without reviewing;
>      those should not appear as empty entries.
>    - For rows with `was_present === true` and `reviewed_at === null`, show the
>      attendance mark and "No review yet" instead of a blank comment.
>    - ⚠️ Format the date with an explicit fixed locale and `timeZone: 'UTC'`. Bare
>      `toLocaleString()` differs between server and client and causes hydration
>      mismatches.
>
> 2. Create `components/media/ReviewForm.tsx` as a **Client Component**:
>    - Props: `mediaId: number`, `existing: Review | null`, `disabled?: boolean`.
>    - Five buttons for 1–5 stars using `aria-pressed` (not bare divs), plus a shadcn
>      `Textarea` for the comment. Pre-fill from `existing`.
>    - Allow a comment with no rating, and a rating with no comment — both columns are
>      nullable. Allow clearing the rating back to null.
>    - Submit calls `upsertReview` inside `useTransition` with a toast either way.
>    - Render nothing at all when `disabled` (guests).
>
> 3. Update `app/media/[type]/[id]/page.tsx`:
>    - Fetch the review rows **on the server**:
>      `.select('*, profiles(display_name, avatar_url)').eq('media_id', id)`.
>    - Render `<ReviewList />` and, for signed-in users, `<ReviewForm />` — but **only
>      when our `media` row's status is `'watched'`**. Reviews make no sense for something
>      nobody has watched.
>    - On query error, render an empty review list and `console.warn` — do not throw.
>
> Output the complete `ReviewList.tsx`, `ReviewForm.tsx`, and the updated detail page.

---

### Step 4.4: The Watched Tab & House Averages `[FUNCTIONAL]`

**Copy and paste this prompt:**

> Task: Build the Watched tab and the household average rating.
>
> 1. Update `app/page.tsx` — the Watched tab only:
>    - `const supabase = await createClient()`.
>    - Select `media` rows where `status = 'watched'`, ordered by `created_at` descending.
>    - Select the `reviews` for those `media_id`s.
>    - Compute `houseAverage` per item:
>      - ⚠️ **Filter out rows where `star_rating` is null before averaging.** Attendance
>        rows start with a null rating, so dividing by the raw row count yields `NaN`,
>        which renders as "⭐ NaN / 5".
>      - If no ratings remain, set it to **`null`**, not `0` — "nobody rated this" and
>        "everybody rated it zero" are different facts, and `0` is not a legal rating.
>      - Round to one decimal for display only.
>    - Map rows through `fromDbRow(...)` and render with `MediaCard`.
>    - On query error, render the empty state and `console.warn` — do not throw.
>
> 2. Create `components/media/HouseAverage.tsx`:
>    - Props: `average: number | null`, `ratingCount: number`, `attendeeCount: number`.
>    - Render e.g. `⭐ 4.5 / 5 · 3 ratings`, and `Not yet rated` when `average` is null.
>    - ⚠️ Show `ratingCount` and `attendeeCount` as **separate** figures. Under your
>      model someone can attend without rating, and rate without attending, so
>      "3 ratings" must not be read as "3 people watched it together".
>    - Include an `aria-label` spelling out the values for screen readers.
>
> 3. Pass `<HouseAverage />` into `MediaCard`'s `actions` slot for watched items. On the
>    Watched tab pass **no** `voteControls` and **no** "Mark Watched" trigger — with slots
>    there is nothing to hide, rather than conditional logic inside the card.
>
> Output the updated `app/page.tsx` and the complete `HouseAverage.tsx`.

---

### Step 4.5: The Attendance Three-Dot Menu `[FUNCTIONAL]`

> **NEW IN v3.** Your requirement: on a watched title's detail page, a three-dot menu in
> the top corner offering "Mark as attended" / "Remove attendance mark". `dropdown-menu`
> is already installed — no new component needed.

**Copy and paste this prompt:**

> Task: Add the attendance menu to the media detail page.
>
> 1. Create the Client Component `components/media/MediaActionsMenu.tsx`:
>    - Props: `mediaId: number`, `wasPresent: boolean | null`, `disabled?: boolean`.
>      (`null` means the caller has no `reviews` row at all yet.)
>    - Use `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
>      `DropdownMenuGroup`, `DropdownMenuItem` from `@/components/ui/dropdown-menu`.
>    - ⚠️ This is **Base UI, not Radix**: pass the trigger via the **`render`** prop
>      (`render={<Button variant="ghost" size="icon" aria-label="More actions" />}`),
>      **not** `asChild`. See `components/layout/Navbar.tsx` for the working pattern.
>    - ⚠️ Wrap the items in `DropdownMenuGroup` — `DropdownMenuLabel` maps to Base UI's
>      `GroupLabel`, which expects a `Group` parent.
>    - Trigger icon: `MoreVertical` from `lucide-react`, positioned top-right of the
>      detail page header.
>    - Show **one** item, depending on state:
>      - `wasPresent !== true` → "Mark as attended", calling `setAttendance(mediaId, true)`
>      - `wasPresent === true` → "Remove attendance mark", calling
>        `setAttendance(mediaId, false)`
>    - Call inside `useTransition` and toast on either outcome.
>    - Render nothing when `disabled` (guests).
>
> 2. Update `app/media/[type]/[id]/page.tsx`:
>    - Determine the current user's own review row from the rows already fetched in
>      Step 4.3 — **do not issue another query.**
>    - Render `<MediaActionsMenu />` in the header, but **only when our `media` row's
>      status is `'watched'`** and the viewer is signed in.
>
> Output the complete `MediaActionsMenu.tsx` and the updated detail page.

---

## Phase 4 exit checklist

- [ ] `npm run build`, `npx tsc --noEmit`, `npx eslint .` all clean
- [ ] Migrations `0002` **and** `0003` applied; `mark_media_watched` typed in
      `Database['public']['Functions']`
- [ ] Marking watched while tagging **all three** members succeeds — the exact case that
      fails without Step 4.0a
- [ ] Tagged members get a notification; the person who clicked does **not**
- [ ] A review left by someone **not** tagged present saves, and shows
      "Watched separately" — **not** "Attended" (proves the `was_present` default trap
      from 4.0c is handled)
- [ ] The displayed review date is when the **review** was left, not when the person was
      tagged — tag someone, wait, then review as them to confirm
- [ ] Editing a review does not change the attendance mark, and toggling attendance does
      not wipe the review
- [ ] "Mark as attended" works for someone who was never tagged and has no review
- [ ] A freshly watched item shows "Not yet rated", never `NaN` or `0`
- [ ] Rating count and attendee count are shown as distinct numbers
- [ ] Guests see reviews but no rating form and no three-dot menu
- [ ] No hydration warnings from review date formatting
