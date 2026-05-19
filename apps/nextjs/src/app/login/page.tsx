import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import {
  DEV_LOGIN_DEFAULT_EMAIL,
  DEV_LOGIN_DEFAULT_PASSWORD,
} from "./dev-login-defaults";
import { signInWithDiscord, signInWithPassword } from "./login-actions";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const showDiscord = Boolean(
    env.AUTH_DISCORD_ID?.trim() && env.AUTH_DISCORD_SECRET?.trim(),
  );

  const emailDefault =
    env.NODE_ENV === "development"
      ? (env.AUTH_DEV_EMAIL ?? DEV_LOGIN_DEFAULT_EMAIL)
      : (env.AUTH_DEV_EMAIL ?? "");
  const passwordDefault =
    env.NODE_ENV === "development"
      ? (env.AUTH_DEV_PASSWORD ?? DEV_LOGIN_DEFAULT_PASSWORD)
      : (env.AUTH_DEV_PASSWORD ?? "");

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center py-12">
      <div className="border-border bg-card w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-foreground text-xl font-semibold">Авторизація</h1>
          <p className="text-muted-foreground text-sm">
            У режимі development поля вже заповнені коректними значеннями за
            замовчуванням.
          </p>
        </div>

        <form action={signInWithPassword} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-foreground text-sm font-medium"
            >
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={emailDefault}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-foreground text-sm font-medium"
            >
              Пароль
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              defaultValue={passwordDefault}
            />
          </div>
          <Button type="submit" className="w-full" size="lg">
            Увійти
          </Button>
        </form>

        {showDiscord ? (
          <form
            action={signInWithDiscord}
            className="border-border border-t pt-4"
          >
            <Button type="submit" variant="outline" className="w-full">
              Увійти через Discord
            </Button>
          </form>
        ) : null}

        <Button asChild variant="ghost" className="w-full" size="sm">
          <Link href="/">На головну</Link>
        </Button>
      </div>
    </main>
  );
}
