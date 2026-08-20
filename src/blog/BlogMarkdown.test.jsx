import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BlogMarkdown from "./BlogMarkdown.jsx";

const representativeMarkdown = `
# Working article heading

Opening copy with \`inline code\` and a [service link](/services).

## Operational checklist

- Confirm ownership
- Record the handover

> A useful briefing makes the next decision clear.

## Comparison

| Stage | Owner | Evidence |
| --- | --- | --- |
| Intake | Agent | Source file |
| Release | Campaign team | Checked output |

## Code example

\`\`\`js
const status = "ready";
\`\`\`

![A labelled example campaign workflow](/og-image.png)

<script>window.__unsafeBlogFixture = true;</script>
`;

describe("BlogMarkdown", () => {
  it("renders representative Markdown with accessible article hierarchy and GFM tables", () => {
    const { container } = render(<BlogMarkdown content={representativeMarkdown} />);

    expect(screen.getByRole("heading", { name: "Working article heading", level: 2 }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operational checklist", level: 3 }))
      .toBeInTheDocument();
    expect(screen.getByRole("blockquote")).toHaveTextContent(
      "A useful briefing makes the next decision clear."
    );
    expect(screen.getByRole("region", { name: "Scrollable article table" }))
      .toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Checked output");
    expect(container.querySelector("pre code")).toHaveTextContent('const status = "ready";');
    expect(screen.getByRole("img", { name: "A labelled example campaign workflow" }))
      .toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("link", { name: "service link" })).toHaveAttribute("href", "/services");
    expect(container.querySelector("script")).toBeNull();
  });

  it("keeps H2 headings at level two when the Markdown body has no H1", () => {
    render(<BlogMarkdown content={"## First working section\n\nBody copy."} />);

    expect(screen.getByRole("heading", { name: "First working section", level: 2 }))
      .toBeInTheDocument();
  });
});
