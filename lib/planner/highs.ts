// Loads the HiGHS WASM solver once per server instance (reused across requests while the function is warm).
import fs from "node:fs";
import path from "node:path";
import highsLoader from "highs";

type Highs = Awaited<ReturnType<typeof highsLoader>>;

let instance: Promise<Highs> | null = null;

/** Path of highs.wasm inside node_modules — next.config.ts traces it into the serverless bundle. */
function wasmPath(): string | null {
  const p = path.join(process.cwd(), "node_modules", "highs", "build", "highs.wasm");
  return fs.existsSync(p) ? p : null;
}

export function getHighs(): Promise<Highs> {
  if (!instance) {
    const wasm = wasmPath();
    instance = highsLoader(wasm ? { locateFile: (file: string) => (file.endsWith(".wasm") ? wasm : file) } : {});
    instance.catch(() => {
      instance = null; // allow a retry on the next request
    });
  }
  return instance;
}
