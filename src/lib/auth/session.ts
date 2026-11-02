import type { Database } from "@/types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole | null;
};

export function getInitials(user: SessionUser | null): string {
  const source = user?.fullName?.trim() || user?.email?.trim() || "EP";
  const parts = source.split(/[\s@]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}
