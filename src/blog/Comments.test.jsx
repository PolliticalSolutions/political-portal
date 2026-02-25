import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Comments, { resolveGiscusConfig } from "./Comments.jsx";

vi.mock("@giscus/react", () => ({
  default: (props) => <div data-testid="giscus-mock" data-term={props.term} />,
}));

describe("Comments", () => {
  it("returns null when required env vars are missing", () => {
    const { container } = render(<Comments slug="example-slug" envOverride={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders widget wrapper and privacy note when configured", () => {
    const env = {
      VITE_GISCUS_REPO: "org/repo",
      VITE_GISCUS_REPO_ID: "repo-id",
      VITE_GISCUS_CATEGORY: "General",
      VITE_GISCUS_CATEGORY_ID: "category-id",
    };

    render(<Comments slug="example-slug" envOverride={env} />);

    expect(screen.getByRole("heading", { name: "Comments" })).toBeInTheDocument();
    expect(screen.getByTestId("giscus-mock")).toHaveAttribute("data-term", "example-slug");
    expect(
      screen.getByText(
        /Comments are powered by GitHub Discussions \(Giscus\)\. This may set cookies or local storage via GitHub to remember your preferences\./
      )
    ).toBeInTheDocument();
  });

  it("respects explicit disabled flag", () => {
    const config = resolveGiscusConfig({
      VITE_GISCUS_ENABLED: "false",
      VITE_GISCUS_REPO: "org/repo",
      VITE_GISCUS_REPO_ID: "repo-id",
      VITE_GISCUS_CATEGORY: "General",
      VITE_GISCUS_CATEGORY_ID: "category-id",
    });

    expect(config.enabled).toBe(false);
  });
});