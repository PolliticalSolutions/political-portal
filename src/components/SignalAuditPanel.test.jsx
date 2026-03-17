import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SignalAuditPanel from "./SignalAuditPanel.jsx";

describe("SignalAuditPanel", () => {
  it("renders signal quality summaries for a model", () => {
    render(<SignalAuditPanel modelKey="vulnerability" />);

    expect(screen.getByText("Signal audit")).toBeInTheDocument();
    expect(screen.getByText(/Robust signals/i)).toBeInTheDocument();
    expect(screen.getByText(/Noisy signals/i)).toBeInTheDocument();
    expect(screen.getByText(/Conservative majority %/i)).toBeInTheDocument();
  });
});
