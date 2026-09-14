import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "public", "assets");
const publicRoot = resolve(root, "public");
if (!assets.startsWith(publicRoot)) throw new Error("Unsafe build output path.");
await rm(assets, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
await cp(resolve(root, "src", "css"), resolve(assets, "css"), { recursive: true });
await cp(resolve(root, "src", "js"), resolve(assets, "js"), { recursive: true });
console.log("Static assets prepared.");
