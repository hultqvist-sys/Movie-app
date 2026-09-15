import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, Clapperboard, LogIn, LogOut, Settings, User } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Top-level app chrome: title, notification bell, and account menu.
 *
 * Async Server Component — reads the Supabase session and unread notification
 * count on every render. Sign-out is a Server Action so no client JS is needed.
 *
 * Base UI note (HANDOVER.md §2.4): there is no `asChild` prop. Navigation items
 * use the `render` prop pattern: `render={<Link href="..." />}`.
 */
export async function Navbar() {
  const supabase = await createClient()

  // getUser() re-validates the JWT with the Supabase Auth server on every call.
  // Prefer it over getSession() for server-side code (more secure).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const unreadCount = user
    ? ((
        await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
      ).count ?? 0)
    : 0

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4"
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Clapperboard className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="font-heading text-base font-semibold tracking-tight">
            Movie Night
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Notification bell — badge only renders when there is something to see. */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              unreadCount > 0
                ? `Notifications (${unreadCount} unread)`
                : 'Notifications'
            }
          >
            <Bell className="size-4" aria-hidden />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-0.5 -right-0.5 size-4 justify-center rounded-full p-0 text-[10px] tabular-nums"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>

          {/* Account menu — branches on session state. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Account menu"
                />
              }
            >
              <Avatar size="sm">
                {user?.email ? (
                  <AvatarFallback>
                    {user.email[0].toUpperCase()}
                  </AvatarFallback>
                ) : (
                  <AvatarFallback>
                    <User className="size-3" aria-hidden />
                  </AvatarFallback>
                )}
              </Avatar>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {user?.email ?? 'Guest'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {user ? (
                  <>
                    {/* render prop — Base UI's equivalent of asChild (HANDOVER §2.4) */}
                    <DropdownMenuItem render={<Link href="/settings" />}>
                      <Settings className="size-4" aria-hidden />
                      Settings
                    </DropdownMenuItem>

                    {/* Sign-out is a Server Action; no client JS required. */}
                    <form action={signOut}>
                      <DropdownMenuItem
                        render={
                          <button
                            type="submit"
                            className="w-full text-left"
                          />
                        }
                        variant="destructive"
                      >
                        <LogOut className="size-4" aria-hidden />
                        Sign out
                      </DropdownMenuItem>
                    </form>
                  </>
                ) : (
                  <DropdownMenuItem render={<Link href="/login" />}>
                    <LogIn className="size-4" aria-hidden />
                    Sign in
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  )
}
