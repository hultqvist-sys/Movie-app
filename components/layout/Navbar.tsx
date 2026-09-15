import Link from 'next/link';
import { Bell, Clapperboard, LogIn, Settings, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Top-level app chrome: title, notification bell, and account menu.
 *
 * PLACEHOLDER STATE — no Supabase Auth yet. The bell count is hardcoded to 0
 * and the account menu always renders the signed-out shape. Phase 2 will read
 * the session here and branch on it.
 */
export function Navbar() {
  // TODO(phase-2): replace with `notifications` rows for the current user.
  const unreadCount = 0;

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

          {/* Account menu — signed-out placeholder until Phase 2 wires the session. */}
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
                <AvatarFallback>
                  <User className="size-3" aria-hidden />
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Guest</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <LogIn className="size-4" aria-hidden />
                  Sign in
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Settings className="size-4" aria-hidden />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
