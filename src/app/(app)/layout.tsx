import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getSessionUser } from "@/lib/auth/access";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar role={user?.role ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="flex-1 px-4 pt-4 pb-10 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
