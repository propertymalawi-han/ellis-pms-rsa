import type { Metadata } from "next";

import { Brand } from "@/components/layout/brand";
import { LoginForm } from "@/app/login/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
};

const loginErrors: Record<string, string> = {
  auth: "Could not complete sign-in. Try again.",
  audit: "Could not record this sign-in. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const notice = error ? loginErrors[error] : undefined;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <Brand />
          <div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Sign in with your Ellis Properties account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {notice ? (
            <p className="mb-4 text-sm text-destructive">{notice}</p>
          ) : null}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
