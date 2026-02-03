import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import { CartProvider } from "./cart/cartStore.jsx";
import ConfigErrorScreen from "./components/ConfigErrorScreen.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { validateEnv } from "./utils/validateEnv.js";

export async function render(url) {
  const helmetContext = {};
  try {
    validateEnv();
  } catch (error) {
    const appHtml = renderToString(
      <ConfigErrorScreen missingKeys={error?.missingKeys} />
    );
    const headHtml = "<title>Configuration error</title>";
    return { appHtml, headHtml };
  }

  const appHtml = renderToString(
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
