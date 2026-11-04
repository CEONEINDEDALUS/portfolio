import { onRequestPost } from "./functions/api/contact.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route contact form submissions to your Pages Function
    if (url.pathname === "/api/contact" && request.method === "POST") {
      return onRequestPost({ request, env });
    }

    // Everything else: serve static files
    return env.ASSETS.fetch(request);
  },
};
