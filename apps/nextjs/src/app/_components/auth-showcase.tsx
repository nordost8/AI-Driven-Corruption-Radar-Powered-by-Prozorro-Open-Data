import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@acme/ui/button";

import { auth, getSession } from "~/auth/server";
import { env } from "~/env";

export async function AuthShowcase() {
  const session = await getSession();
  const showDiscord = Boolean(
    env.AUTH_DISCORD_ID?.trim() && env.AUTH_DISCORD_SECRET?.trim(),
  );

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Button size="lg" asChild>
          <Link href="/login">Авторизація</Link>
        </Button>
        {showDiscord ? (
          <form>
            <Button
              size="lg"
              variant={env.NODE_ENV === "development" ? "outline" : "default"}
              formAction={async () => {
                "use server";
                const res = await auth.api.signInSocial({
                  body: {
                    provider: "discord",
                    callbackURL: "/",
                  },
                });
                if (!res.url) {
                  throw new Error("No URL returned from signInSocial");
                }
                redirect(res.url);
              }}
            >
              Sign in with Discord
            </Button>
          </form>
        ) : null}
        {!showDiscord ? (
          <p className="text-muted-foreground max-w-sm text-center text-xs">
            Discord OAuth не налаштовано — використовуйте email і пароль на
            сторінці входу.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-muted-foreground text-center text-xs">
        Ви авторизовані.
      </p>
      <Button size="lg" asChild>
        <Link href="/">До радара</Link>
      </Button>
    </div>
  );
}
