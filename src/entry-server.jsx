import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import { CartProvider } from "./cart/cartStore.jsx";

export async function render(url) {
  const helmetContext = {};

  const appHtml = renderToString(
    <HelmetProvider context={helmetContext}>
      <MemoryRouter initialEntries={[url]}>
        <CartProvider>
          <App />
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
