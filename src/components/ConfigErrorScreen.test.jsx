import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;

describe("ConfigErrorScreen", () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it("shows missing key details in non-production builds", async () => {
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const { default: ConfigErrorScreen } = await import("./ConfigErrorScreen.jsx");

    render(<ConfigErrorScreen missingKeys={["VITE_COGNITO_DOMAIN"]} />);
    expect(screen.getByText(/Missing environment variables: VITE_COGNITO_DOMAIN/)).toBeInTheDocument();
  });

  it("shows a generic message in production builds", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { default: ConfigErrorScreen } = await import("./ConfigErrorScreen.jsx");

    render(<ConfigErrorScreen missingKeys={["VITE_COGNITO_DOMAIN"]} />);
    expect(
      screen.getByText("The application is temporarily unavailable due to a configuration issue.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/VITE_COGNITO_DOMAIN/)).not.toBeInTheDocument();
  });
});
