import { createDeepSeek } from "@ai-sdk/deepseek";

import { env } from "~/env";

const deepseek = createDeepSeek({
  apiKey: env.DEEPSEEK_API_KEY,
});

export const model = deepseek("deepseek-chat");
