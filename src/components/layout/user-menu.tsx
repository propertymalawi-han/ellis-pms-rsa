"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";

import { signOut } from "@/lib/auth/actions";
import { getInitials, type SessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  const displayName = user.fullName ?? user.email ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {getInitials(user)}
          </span>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <UserRound className="size-3.5" />
            {displayName}
          </p>
          {user.email ? (
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem variant="destructive" asChild>
            <button type="submit" className="w-full">
              <LogOut className="size-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
