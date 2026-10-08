import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const directory of ["public", "src", "data", "docs"]) {
  const source = path.join(root, directory);
  if (existsSync(source)) cpSync(source, path.join(output, directory === "public" ? "" : directory), { recursive: true });
}
console.log(`Sitio estático preparado en ${path.relative(root, output)}.`);
