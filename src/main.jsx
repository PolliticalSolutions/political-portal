import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import { CartProvider } from "./cart/cartStore.jsx";
import ConfigErrorScreen from "./components/ConfigErrorScreen.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { validateEnv } from "./utils/validateEnv.js";
import "./index.css";

const container = document.getElementById("root");
let renderApp = null;

try {
  validateEnv();
  renderApp = (
    <React.StrictMode>
      <HelmetProvider>
        <BrowserRouter>
          <CartProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </CartProvider>
        </BrowserRouter>
      </HelmetProvider>
    </React.StrictMode>
  );
} catch (error) {
  console.error(error);
  renderApp = (
    <React.StrictMode>
      <ConfigErrorScreen missingKeys={error?.missingKeys} />
    </React.StrictMode>
  );
}

if (container?.hasChildNodes()) {
  hydrateRoot(container, renderApp);
} else if (container) {
  createRoot(container).render(renderApp);
}
