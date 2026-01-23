import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PortalLayout from "./PortalLayout.jsx";

describe("PortalLayout SEO", () => {
  it("sets robots to noindex", async () => {
    render(
      <MemoryRouter>
        <PortalLayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]')?.getAttribute("content");
      expect(robots).toBe("noindex,nofollow");
    });
  });
});
