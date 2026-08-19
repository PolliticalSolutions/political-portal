import React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import { CartProvider } from "./cart/cartStore.jsx";
import ConfigErrorScreen from "./components/ConfigErrorScreen.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { validateEnv } from "./utils/validateEnv.js";

const PRERENDER_TIMEOUT_MS = 15000;

async function renderStaticApp(element) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error("Static prerender timed out.")),
    PRERENDER_TIMEOUT_MS
  );
  let renderError = null;

  try {
    const { prelude } = await prerenderToNodeStream(element, {
      signal: controller.signal,
      onError(error) {
        renderError ||= error;
      },
    });

    prelude.setEncoding("utf8");
    let html = "";
    for await (const chunk of prelude) {
      html += chunk;
    }

    if (renderError) throw renderError;
    return html;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function render(url) {
  const helmetContext = {};
  const skipEnvValidation = process.env.PRERENDER_SKIP_ENV_VALIDATION === "1";
  if (!skipEnvValidation) {
    try {
      validateEnv();
    } catch (error) {
      const appHtml = await renderStaticApp(
        <ConfigErrorScreen missingKeys={error?.missingKeys} />
      );
      const headHtml = "<title>Configuration error</title>";
      return { appHtml, headHtml };
    }
  }

  const appHtml = await renderStaticApp(
    <HelmetProvider context={helmetContext}>
      <MemoryRouter initialEntries={[url]}>
        <CartProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </CartProvider>
      </MemoryRouter>
    </HelmetProvider>
  );

  const { helmet } = helmetContext;
  const headHtml = [
    helmet?.title?.toString() || "",
    helmet?.meta?.toString() || "",
    helmet?.link?.toString() || "",
    helmet?.script?.toString() || "",
  ].join("");

  return { appHtml, headHtml };
}
