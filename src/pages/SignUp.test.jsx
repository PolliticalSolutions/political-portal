import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../data/associations.json", () => ({
  default: {
    byAssociation: {
      "Big Federation": ["Seat A", "Seat B", "Seat C"],
    },
    byConstituency: {
      "Seat A": "Big Federation",
      "Seat B": "Big Federation",
      "Seat C": "Big Federation",
    },
  },
}));

import SignUp from "./SignUp.jsx";

describe("SignUp", () => {
  it("renders association summary and totals from query params", () => {
    render(
      <MemoryRouter initialEntries={["/signup?association=Big%20Federation&count=3"]}>
        <Routes>
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Big Federation")).toBeInTheDocument();
    expect(screen.getByText("3 constituencies")).toBeInTheDocument();
    expect(screen.getByText("Total (inc VAT): £1,200.00")).toBeInTheDocument();
  });
});
