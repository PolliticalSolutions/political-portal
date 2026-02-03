import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { seoRoutes } from "../src/seo/seoRoutes.js";

const distDir = path.resolve("dist");
const ssrEntry = path.resolve("dist-ssr", "entry-server.js");

const template = await fs.readFile(path.join(distDir, "index.html"), "utf-8");
const { render } = await import(pathToFileURL(ssrEntry).href);

const normalizeRoute = (routePath) => {
  if (!routePath || routePath === "/") return "/";
  return routePath.endsWith("/") ? routePath.slice(0, -1) : routePath;
};

const injectHead = (html, headHtml) => html.replace("</head>", `${headHtml}</head>`);

const injectApp = (html, appHtml) => {
  const rootPattern = /<div id="root">[\s\S]*?<\/div>/;
  if (!rootPattern.test(html)) {
    throw new Error("Template is missing #root container.");
  }
  return html.replace(rootPattern, `<div id="root">${appHtml}</div>`);
};

const routesToRender = seoRoutes.filter((route) => !route.noindex);

await Promise.all(
  routesToRender.map(async (route) => {
    const routePath = normalizeRoute(route.path);
    const { appHtml, headHtml } = await render(routePath);
    const html = injectApp(injectHead(template, headHtml), appHtml);

    const outputPath =
      routePath === "/"
        ? path.join(distDir, "index.html")
        : path.join(distDir, routePath.slice(1), "index.html");

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, "utf-8");
  })
);
