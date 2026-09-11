/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1Database } from "@cloudflare/workers-types";
import type { R2Bucket } from "@cloudflare/workers-types";
import { handleCommunity } from "../server/community.mjs";
import { handleCatalog } from "../server/catalog.mjs";
import { handleMuseumImage } from "../server/museum-images.mjs";
import { handleReports } from "../server/reports.mjs";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  PHOTOS: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const report = await handleReports(request, env);
    if (report) return report;
    const museumImage = handleMuseumImage(request);
    if (museumImage) return museumImage;
    const catalog = await handleCatalog(request, env);
    if (catalog) return catalog;
    const community = await handleCommunity(request, env);
    if (community) {
      if (request.method === "GET" || request.method === "HEAD") community.headers.set("Access-Control-Allow-Origin", "*");
      return community;
    }
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
