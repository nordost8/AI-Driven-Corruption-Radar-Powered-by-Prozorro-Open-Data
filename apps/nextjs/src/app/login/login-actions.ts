"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "~/auth/server";

export async function signInWithDiscord() {
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
}

export async function signInWithPassword(formData: FormData) {
  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
  const password = typeof passwordRaw === "string" ? passwordRaw : "";

  if (!email || !password) {
    throw new Error("Вкажіть email і пароль.");
  }

  const hdrs = await headers();

  const signInTry = await auth.api
    .signInEmail({
      body: { email, password },
      headers: hdrs,
    })
    .catch(() => null);

  if (!signInTry?.user) {
    await auth.api
      .signUpEmail({
        body: { email, password, name: "Local Dev" },
        headers: hdrs,
      })
      .catch(() => {
        /* користувач вже існує */
      });

    await auth.api.signInEmail({
      body: { email, password },
      headers: hdrs,
    });
  }

  redirect("/");
}
