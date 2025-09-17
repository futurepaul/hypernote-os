import { serve } from "bun";
import index from "./index.html";

// Frontend-only server with SPA fallback. No API routes.
const server = serve({
  port: 3420,
  routes: {
    // Serve index.html for all routes (SPA)
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Frontend running at ${server.url}`);
