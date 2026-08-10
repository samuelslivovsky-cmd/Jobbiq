import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@jobbiq/db"],
  // Monorepo root, so output file tracing sees the pnpm store.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Prisma's query engine lives in the pnpm store and the tracer misses it —
  // without this the deployed function crashes with PrismaClientInitializationError.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.pnpm/**/.prisma/client/**",
      "../../node_modules/.pnpm/**/.prisma/client/**",
    ],
  },
};

export default nextConfig;
