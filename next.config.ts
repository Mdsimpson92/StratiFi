import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ['unenrolled-unrejectable-gennie.ngrok-free.dev', '192.168.1.82'],
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: { disable: true },
});
