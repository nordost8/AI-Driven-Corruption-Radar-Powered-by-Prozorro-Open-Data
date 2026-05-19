import { createJiti } from "jiti";
import path from "node:path";

process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ??= "1";
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= "1";

const jiti = createJiti(import.meta.url);

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
await jiti.import("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  env: {
    BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA: "1",
    BROWSERSLIST_IGNORE_OLD_DATA: "1",
  },
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@acme/api",
    "@acme/auth",
    "@acme/db",
    "@acme/ui",
  ],
};

export default config;
