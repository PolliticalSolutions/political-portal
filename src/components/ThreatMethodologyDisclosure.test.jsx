import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ThreatMethodologyDisclosure from "./ThreatMethodologyDisclosure.jsx";

describe("ThreatMethodologyDisclosure", () => {
  it("renders the summary, disclaimer, and top-seat explanation", () => {
    render(
      <ThreatMethodologyDisclosure
        summary="This score combines current electoral pressure and structural context."
        signals={[{ label: "Vote share", body: "Higher challenger vote share increases risk." }]}
        disclaimer="These scores are analytical tools to support planning, not predictions of electoral outcomes."
        topSeatName="Example West"
        topSeatExplanation="The challenger already has a strong local base and the governing majority is narrow."
      />
    );

    expect(screen.getByText("How this works")).toBeInTheDocument();
    expect(screen.getByText(/These scores are analytical tools/)).toBeInTheDocument();
    expect(screen.getByText(/Why Example West ranks highly/)).toBeInTheDocument();
  });
});
