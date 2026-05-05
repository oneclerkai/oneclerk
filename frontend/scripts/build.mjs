import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const sourceStatic = path.join(repoRoot, "app", "static");
const dist = path.join(frontendRoot, "dist");
const distStatic = path.join(dist, "static");

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const jsString = JSON.stringify(apiUrl.replace(/\/$/, ""));

await rm(dist, { recursive: true, force: true });
await mkdir(distStatic, { recursive: true });

let appJs = await readFile(path.join(sourceStatic, "app.js"), "utf8");
appJs = appJs.replace('const API = "";', `const API = ${jsString};`);

await writeFile(path.join(distStatic, "app.js"), appJs);
await copyFile(path.join(sourceStatic, "styles.css"), path.join(distStatic, "styles.css"));
await copyFile(path.join(sourceStatic, "index.html"), path.join(dist, "index.html"));

console.log(`Built frontend with API=${apiUrl || "(same-origin)"}`);
