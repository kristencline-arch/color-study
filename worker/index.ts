/** Image processing stays local; only explicitly submitted community photos are uploaded. */
import handler from "vinext/server/app-router-entry";
import { handleCommunity } from "../server/community.mjs";

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, context: {waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void}): Promise<Response> {
    const community = await handleCommunity(request, env);
    if (community) {
      if (["GET", "HEAD"].includes(request.method)) community.headers.set("Access-Control-Allow-Origin", "*");
      return community;
    }
    return handler.fetch(request, env, context);
  },
};

export default worker;
