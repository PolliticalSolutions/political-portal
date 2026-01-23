import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import CookieNotice from "./CookieNotice.jsx";

describe("CookieNotice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows on first visit and persists dismissal", () => {
    render(
      <MemoryRouter>
        <CookieNotice />
      </MemoryRouter>
    );

    expect(screen.getByText(/essential local storage/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(localStorage.getItem("ps_cookie_notice_ack_v1")).toBe("true");
    expect(screen.queryByText(/essential local storage/i)).not.toBeInTheDocument();
  });
});
