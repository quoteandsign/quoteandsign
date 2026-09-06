import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    // Localhost only by default. `npm run dev:lan` opens it to your home network
    // for the phone test. Foreground process; Ctrl+C ends everything.
    host: "127.0.0.1", // `npm run dev:lan` passes --host to expose on the home network
    port: 5173,
    strictPort: true,
  },
  build: { sourcemap: false },
});
