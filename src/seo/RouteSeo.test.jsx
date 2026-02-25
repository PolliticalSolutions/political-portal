import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import RouteSeo from "./RouteSeo.jsx";

const renderRouteSeo = (path) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <RouteSeo />
      </MemoryRouter>
    </HelmetProvider>
  );

afterEach(() => {
  document.title = "";
  document.head.querySelectorAll("meta, link, script").forEach((node) => node.remove());
});

describe("RouteSeo", () => {
  it("sets noindex for portal and login routes", async () => {
    renderRouteSeo("/portal/ops/quotes");
    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("noindex, nofollow");
    });

    renderRouteSeo("/login");
    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("noindex, nofollow");
    });
  });

  it("sets index,follow for /subscriptions", async () => {
    renderRouteSeo("/subscriptions");
    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("index,follow");
      expect(document.title).toBe("Political Solutions | Portal subscriptions");
    });
  });

  it("sets canonical and og:url to matching non-www absolute URL", async () => {
    renderRouteSeo("/services");
    await waitFor(() => {
      const canonical = document.querySelector("link[rel='canonical']")?.getAttribute("href");
      const ogUrl = document.querySelector("meta[property='og:url']")?.content;
      expect(canonical).toBe("https://politicalsolutions.uk/services");
      expect(ogUrl).toBe(canonical);
      expect(canonical?.includes("www.")).toBe(false);
    });
  });

  it("sets /blog as indexable with canonical blog URL", async () => {
    renderRouteSeo("/blog");
    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("index,follow");
      expect(document.querySelector("link[rel='canonical']")?.getAttribute("href")).toBe(
        "https://politicalsolutions.uk/blog"
      );
    });
  });

  it("sets draft blog posts to noindex", async () => {
    renderRouteSeo("/blog/2026-02-24-draft-post");
    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("noindex, nofollow");
    });
  });

  it("sets missing blog posts to noindex", async () => {
    renderRouteSeo("/blog/not-a-real-post");
    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("noindex, nofollow");
    });
  });
});
