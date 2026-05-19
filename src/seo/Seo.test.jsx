import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, describe, expect, it } from "vitest";
import Seo from "./Seo.jsx";

const renderSeo = (props) =>
  render(
    <HelmetProvider>
      <Seo {...props} />
    </HelmetProvider>
  );

afterEach(() => {
  document.title = "";
  document.head.querySelectorAll("meta, link, script").forEach((node) => node.remove());
});

describe("Seo", () => {
  it("sets title, description, canonical, and social tags", async () => {
    renderSeo({
      title: "Services | Political Solutions",
      description: "Explore services for political operations.",
      path: "/services",
    });

    await waitFor(() => {
      expect(document.title).toBe("Services | Political Solutions");
    });

    expect(document.querySelector("meta[name='description']")?.content).toBe(
      "Explore services for political operations.",
    );
    expect(document.querySelector("link[rel='canonical']")?.getAttribute("href")).toBe(
      "https://politicalsolutions.uk/services",
    );
    expect(document.querySelector("meta[property='og:title']")?.content).toBe(
      "Services | Political Solutions",
    );
    expect(document.querySelector("meta[property='og:description']")?.content).toBe(
      "Explore services for political operations.",
    );
    expect(document.querySelector("meta[property='og:url']")?.content).toBe(
      "https://politicalsolutions.uk/services",
    );
    expect(document.querySelector("meta[name='twitter:card']")?.content).toBe("summary_large_image");
    expect(document.querySelector("meta[name='twitter:title']")?.content).toBe(
      "Services | Political Solutions",
    );
    expect(document.querySelector("meta[name='twitter:description']")?.content).toBe(
      "Explore services for political operations.",
    );
    expect(document.querySelector("meta[property='og:image']")?.content).toMatch(
      /^https:\/\/politicalsolutions\.uk/
    );
    expect(document.querySelector("meta[name='twitter:image']")?.content).toMatch(
      /^https:\/\/politicalsolutions\.uk/
    );
    expect(document.querySelector("meta[property='og:image:alt']")?.content).toBe(
      "Political Solutions logo"
    );
  });

  it("adds noindex when specified", async () => {
    renderSeo({
      title: "Login | Political Solutions",
      description: "Client login.",
      path: "/login",
      noindex: true,
    });

    await waitFor(() => {
      expect(document.querySelector("meta[name='robots']")?.content).toBe("noindex, nofollow");
    });
  });
});
