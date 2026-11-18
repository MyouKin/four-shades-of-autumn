import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../dist/", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.webmanifest"), "utf8"));
const worker = await readFile(path.join(root, "sw.js"), "utf8");
const html = await readFile(path.join(root, "index.html"), "utf8");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.id, "./");
assert.match(html, /rel="manifest"/);
const entries = new Map();
for (const match of worker.matchAll(/\{url:"([^"]+)",revision:(null|"[^"]+")\}/g)) {
  assert.ok(!/^(https?:|\/)/.test(match[1]), `Precache must work in a subdirectory: ${match[1]}`);
  if (entries.has(match[1])) assert.equal(entries.get(match[1]), match[2], `Conflicting cache revision: ${match[1]}`);
  entries.set(match[1], match[2]);
}
assert.ok(entries.has("index.html"), "HTML must be available on an offline cold start");
assert.ok([...entries.keys()].some((file) => /^assets\/ai\.worker-.+\.js$/.test(file)), "AI worker is missing from offline cache");
for (const entry of await readdir(root, { recursive: true })) {
  const file = entry.split(path.sep).join("/");
  if (!/\.(js|css|html|png|svg|ico|json|webmanifest|woff2?|wasm|mp3|wav|ogg)$/.test(file)) continue;
  // A service worker and its importScripts dependencies use the browser's SW script cache.
  if (file === "sw.js" || /^workbox-[^/]+\.js$/.test(file)) continue;
  assert.ok(entries.has(file), `Build asset missing from precache: ${file}`);
}
for (const icon of manifest.icons) {
  assert.ok(entries.has(icon.src), `Icon missing from offline cache: ${icon.src}`);
  const bytes = await readFile(path.join(root, icon.src));
  const expected = Number(icon.sizes.split("x")[0]);
  assert.equal(bytes.readUInt32BE(16), expected, `Wrong icon width: ${icon.src}`);
  assert.equal(bytes.readUInt32BE(20), expected, `Wrong icon height: ${icon.src}`);
}
console.log(`PWA build verified: ${entries.size} local assets, AI worker, standalone manifest, installation icons, relative URLs.`);
