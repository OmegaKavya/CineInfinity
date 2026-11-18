import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },
  build: {
    outDir: "dist",
    // Production shipped a 2 MB .map alongside the bundle, which hands anyone
    // opening devtools the original source: file names, comments and all.
    // Dev builds still have full source maps; only the deployed one drops them.
    sourcemap: false,
  },
  test: {
    // happy-dom rather than jsdom.
    //
    // jsdom 27 took minutes to initialise on this machine: a test asserting
    // only that `document` exists never finished, and a trivial component
    // render was indistinguishable from a hang. happy-dom implements the
    // same surface Testing Library needs and starts in milliseconds.
    //
    // jsdom stays in devDependencies so it can be swapped back if some API
    // happy-dom lacks is ever required.
    environment: "happy-dom",
    // Pure-logic suites opt out of a DOM entirely with a
    // `// @vitest-environment node` docblock at the top of the file.
  },
});
