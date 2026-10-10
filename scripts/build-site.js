import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const directory of ["public", "src", "data", "docs"]) {
  const source = path.join(root, directory);
  if (existsSync(source)) cpSync(source, path.join(output, directory === "public" ? "" : directory), { recursive: true });
}
const vendor = path.join(output, "vendor");
mkdirSync(vendor, { recursive: true });
await build({
  stdin: {
    contents: 'export { createClient, AnamEvent } from "@anam-ai/js-sdk";\n',
    resolveDir: root,
    sourcefile: "anam-sdk-entry.js",
    loader: "js",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(vendor, "anam-sdk.js"),
  logLevel: "warning",
});
console.log(`Sitio estático preparado en ${path.relative(root, output)}.`);
