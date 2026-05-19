import { authRouter } from "./router/auth";
import { postRouter } from "./router/post";
import { prozorroRiskRouter } from "./router/prozorro-risk";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  prozorroRisk: prozorroRiskRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
