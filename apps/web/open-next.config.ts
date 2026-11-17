import type { OpenNextConfig } from "@opennextjs/cloudflare";

// Canonical Cloudflare adapter overrides required by @opennextjs/cloudflare
// 1.20.x (see ensure-cf-config.js). The app is fully dynamic (auth cookies on
// every route), so the dummy caches are correct. The API route handlers use
// node:crypto, hence edgeExternals; proxy.ts runs as external edge middleware.
const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct",
    },
  },
  edgeExternals: ["node:crypto"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct",
    },
  },
};

export default config;
