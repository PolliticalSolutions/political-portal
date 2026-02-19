import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ManualReviewPage from "./ManualReviewPage.jsx";

vi.mock("../../../lib/uploadApi.js", () => ({
  listManualReviewJobs: vi.fn(),
  getManualReviewJob: vi.fn(),
  resolveManualReviewJob: vi.fn(),
}));

import * as uploadApi from "../../../lib/uploadApi.js";

describe("ManualReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders manual review queue list", async () => {
    uploadApi.listManualReviewJobs.mockResolvedValue({
      items: [
        {
          jobId: "mr-open-1",
          createdAt: "2026-01-04T00:00:00.000Z",
          orgId: "org-a",
          pconCode: "E14000637",
          electionId: "OTHER",
          manualReviewReason: "Election missing from configured list.",
        },
      ],
    });
    uploadApi.getManualReviewJob.mockResolvedValue({
      job: {
        jobId: "mr-open-1",
        userId: "user-sub-1",
        orgId: "org-a",
        pconCode: "E14000637",
        electionId: "OTHER",
        wardCodes: ["W1001"],
        manualReviewReason: "Election missing from configured list.",
      },
    });

    render(<ManualReviewPage />);

    expect(await screen.findByText("mr-open-1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("mr-open-1"));
    expect(await screen.findByText("Review detail")).toBeInTheDocument();
    expect(screen.getByText("W1001")).toBeInTheDocument();
  });

  it("requires note and resolves review item", async () => {
    uploadApi.listManualReviewJobs
      .mockResolvedValueOnce({
        items: [
          {
            jobId: "mr-open-1",
            createdAt: "2026-01-04T00:00:00.000Z",
            orgId: "org-a",
            pconCode: "E14000637",
            electionId: "OTHER",
            manualReviewReason: "Election missing from configured list.",
          },
        ],
      })
      .mockResolvedValueOnce({ items: [] });
    uploadApi.getManualReviewJob.mockResolvedValue({
      job: {
        jobId: "mr-open-1",
        userId: "user-sub-1",
        orgId: "org-a",
        pconCode: "E14000637",
        electionId: "OTHER",
        manualReviewReason: "Election missing from configured list.",
      },
    });
    uploadApi.resolveManualReviewJob.mockResolvedValue({ job: { jobId: "mr-open-1" } });

    render(<ManualReviewPage />);

    expect(await screen.findByText("mr-open-1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("mr-open-1"));
    await screen.findByLabelText(/Note/);

    const saveButton = screen.getByRole("button", { name: "Save decision" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Note/), {
      target: { value: "Validated against source documents and approved." },
    });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(uploadApi.resolveManualReviewJob).toHaveBeenCalledWith("mr-open-1", {
        decision: "APPROVE",
        note: "Validated against source documents and approved.",
      });
    });
    expect(await screen.findByText("No open manual review jobs.")).toBeInTheDocument();
  });
});
