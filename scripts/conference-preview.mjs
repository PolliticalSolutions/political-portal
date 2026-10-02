// Serve the production build with the same per-route HTML rewrites as Amplify.
// Vite preview otherwise serves homepage HTML at /conference and causes hydration mismatch.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = path.resolve("dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ttf": "font/ttf", ".json": "application/json", ".xml": "application/xml" };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) { res.writeHead(403); res.end(); return; }
    try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); }
    catch { if (!path.extname(file)) file = path.join(root, "index.html"); }
    const content = await readFile(file);
    const compressed = req.headers["accept-encoding"]?.includes("gzip");
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache",
      ...(compressed ? { "Content-Encoding": "gzip" } : {}),
      ...(/^\/conference\/?$/.test(pathname) ? { "X-Robots-Tag": "noindex, nofollow" } : {}) });
    res.end(compressed ? gzipSync(content) : content);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(4173, "127.0.0.1", () => console.log("Production conference preview: http://localhost:4173/conference"));
