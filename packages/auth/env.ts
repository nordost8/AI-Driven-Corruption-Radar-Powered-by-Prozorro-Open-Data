import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function authEnv() {
  return createEnv({
    server: {
      /** Discord OAuth — опційно; якщо порожньо, лишається лише email/password (для dev). */
      AUTH_DISCORD_ID: z.string().optional(),
      AUTH_DISCORD_SECRET: z.string().optional(),
      /** Локальний dev-логін email (за замовчуванням у коді — `dev@example.com`). */
      AUTH_DEV_EMAIL: z.string().email().optional(),
      /** Пароль для dev email (мін. 8 символів для Better Auth). */
      AUTH_DEV_PASSWORD: z.string().min(8).optional(),
      AUTH_SECRET:
        process.env.NODE_ENV === "production"
          ? z.string().min(1)
          : z.string().min(1).optional(),
      NODE_ENV: z.enum(["development", "production"]).optional(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
