import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getPrerenderRoutes } from "./prerender-routes.mjs";

process.env.PRERENDER_SKIP_ENV_VALIDATION = "1";

// SSR-excluded browser-only components (never server-rendered).
// These are isolated via React.lazy so they never appear in the SSR module graph.
// Do not add static imports for these anywhere in the SSR import chain.
//   - src/pages/portal/constituency/ConstituencyMapClient.jsx (react-simple-maps, GeoJSON data)

const distDir = path.resolve("dist");
const ssrEntry = path.resolve("dist-ssr", "entry-server.js");

const template = await fs.readFile(path.join(distDir, "index.html"), "utf-8");
let conferenceTemplate = await fs.readFile(path.join(distDir, "conference.html"), "utf-8");
// The QR page reuses the site's CSS, inlined into its small HTML response to
// avoid a render-blocking round trip on conference Wi-Fi and mobile data.
for (const [tag] of conferenceTemplate.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
  const href = tag.match(/href="(\/assets\/[^\"]+)"/)?.[1];
  if (href) {
    const css = await fs.readFile(path.join(distDir, href.slice(1)), "utf-8");
    conferenceTemplate = conferenceTemplate.replace(tag, `<style>${css}</style>`);
  }
}
const { render } = await import(pathToFileURL(ssrEntry).href);

const normalizeRoute = (routePath) => {
  if (!routePath || routePath === "/") return "/";
  return routePath.endsWith("/") ? routePath.slice(0, -1) : routePath;
};

// Strip the fallback <title> and <meta name="description"> from index.html so
// react-helmet-async's per-route tags (in headHtml) don't end up as duplicates
// alongside the static safety-net tags. The fallbacks in index.html exist for
// the no-JS / no-SSR case; once we have a real prerendered head, they go.
const injectHead = (html, headHtml) =>
  html
    .replace(/\s*<title\b[^>]*>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+name="description"[^>]*>/i, "")
    .replace("</head>", `${headHtml}</head>`);

const injectApp = (html, appHtml) => {
  const rootPattern = /<div id="root">[\s\S]*?<\/div>/;
  if (!rootPattern.test(html)) {
    throw new Error("Template is missing #root container.");
  }
  return html.replace(rootPattern, `<div id="root">${appHtml}</div>`);
};

const routesToRender = getPrerenderRoutes();

await Promise.all(
  routesToRender.map(async (routePathValue) => {
    const routePath = normalizeRoute(routePathValue);
    const { appHtml, headHtml } = await render(routePath);
    const routeTemplate = routePath === "/conference" ? conferenceTemplate : template;
    const html = injectApp(injectHead(routeTemplate, headHtml), appHtml);

    const outputPath =
      routePath === "/"
        ? path.join(distDir, "index.html")
        : path.join(distDir, routePath.slice(1), "index.html");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, "utf-8");
  })
);
await fs.unlink(path.join(distDir, "conference.html"));
