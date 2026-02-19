import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Uploads from "./Uploads.jsx";

vi.mock("../../lib/uploadApi.js", () => ({
  createJob: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  getDownloadUrls: vi.fn(),
  listElections: vi.fn(),
}));

import * as uploadApi from "../../lib/uploadApi.js";

function makeFile(name, type = "application/pdf", size = 1024) {
  const content = "x".repeat(size);
  return new File([content], name, { type });
}

function setInputFiles(input, files) {
  Object.defineProperty(input, "files", {
    value: files,
    configurable: true,
  });
  fireEvent.change(input);
}

function setRequiredPconCode() {
  fireEvent.change(screen.getByLabelText(/Constituency code \(PCON24CD\)/i), {
    target: { value: "E14000637" },
  });
}

async function setRequiredElection() {
  await waitFor(() => expect(uploadApi.listElections).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText(/^Election$/i), {
    target: { value: "election-1" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadApi.listJobs.mockResolvedValue({ items: [] });
  uploadApi.listElections.mockResolvedValue({
    items: [
      {
        electionId: "election-1",
        name: "Local Election",
        date: "2026-05-07",
      },
    ],
  });
});

afterEach(() => {
  delete global.fetch;
});

describe("Uploads – file validation", () => {
  it("shows an error for unsupported file types", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    const badFile = makeFile("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    setInputFiles(input, [badFile]);

    await waitFor(() => {
      expect(screen.getByText(/only PDF and CSV files are accepted/)).toBeInTheDocument();
    });
  });

  it("accepts PDF files without error", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    const pdfFile = makeFile("document.pdf", "application/pdf");
    setInputFiles(input, [pdfFile]);

    await waitFor(() => {
      expect(screen.getByText(/document\.pdf/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF and CSV/)).not.toBeInTheDocument();
  });

  it("accepts CSV files without error", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    const csvFile = makeFile("data.csv", "text/csv");
    setInputFiles(input, [csvFile]);

    await waitFor(() => {
      expect(screen.getByText(/data\.csv/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF and CSV/)).not.toBeInTheDocument();
  });

  it("shows an error when a file exceeds 200 MB", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    const bigFile = makeFile("huge.csv", "text/csv", 200 * 1024 * 1024 + 1);
    setInputFiles(input, [bigFile]);

    await waitFor(() => {
      expect(screen.getByText(/200 MB size limit/)).toBeInTheDocument();
    });
  });
});

describe("Uploads – upload flow", () => {
  it("calls createJob with filename, fileType, and metadata", async () => {
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-1",
      upload: {
        url: "https://s3.example.com/presigned-post",
        fields: { key: "uploads/sub1/test-job-1/report.pdf", policy: "abc" },
      },
      s3Key: "uploads/sub1/test-job-1/report.pdf",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    await waitFor(() => screen.getByLabelText(/Client name/));

    fireEvent.change(screen.getByLabelText(/Client name/), {
      target: { value: "Greenfield Association" },
    });
    fireEvent.change(screen.getByLabelText(/Notes/), {
      target: { value: "Urgent batch" },
    });
    setRequiredPconCode();
    await setRequiredElection();

    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(uploadApi.createJob).toHaveBeenCalledWith({
        filename: "report.pdf",
        pconCode: "E14000637",
        electionId: "election-1",
        fileType: "pdf",
        size: 1024,
        metadata: { clientName: "Greenfield Association", notes: "Urgent batch" },
      });
    });
  });

  it("POSTs FormData to the presigned S3 URL returned by createJob", async () => {
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-2",
      upload: {
        url: "https://bucket.s3.amazonaws.com",
        fields: {
          key: "uploads/sub1/test-job-2/data.csv",
          policy: "abc",
          "x-amz-signature": "sig",
          "Content-Type": "text/csv",
        },
      },
      s3Key: "uploads/sub1/test-job-2/data.csv",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("data.csv", "text/csv")]);

    await waitFor(() => screen.getByText(/Upload 1 file/));
    setRequiredPconCode();
    await setRequiredElection();
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://bucket.s3.amazonaws.com",
        expect.objectContaining({ method: "POST" })
      );
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("key")).toBe("uploads/sub1/test-job-2/data.csv");
    expect(options.body.get("file")).toBeInstanceOf(File);
  });

  it("shows the new job in the table after a successful upload", async () => {
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-3",
      upload: {
        url: "https://s3.example.com/presigned",
        fields: { key: "uploads/sub1/test-job-3/report.pdf" },
      },
      s3Key: "uploads/sub1/test-job-3/report.pdf",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    await waitFor(() => screen.getByText(/Upload 1 file/));
    setRequiredPconCode();
    await setRequiredElection();
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(screen.getByText("report.pdf")).toBeInTheDocument();
    });
  });

  it("displays upload error when S3 POST fails", async () => {
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-fail",
      upload: {
        url: "https://s3.example.com/presigned",
        fields: { key: "uploads/sub1/test-job-fail/report.pdf" },
      },
      s3Key: "uploads/sub1/test-job-fail/report.pdf",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    await waitFor(() => screen.getByText(/Upload 1 file/));
    setRequiredPconCode();
    await setRequiredElection();
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(screen.getByText(/S3 upload failed/)).toBeInTheDocument();
    });
  });
});

describe("Uploads – polling", () => {
  it("calls getJob at each poll interval for non-terminal jobs", async () => {
    vi.useFakeTimers();

    const queuedJob = {
      jobId: "poll-job-1",
      filename: "test.pdf",
      fileType: "pdf",
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    uploadApi.listJobs.mockResolvedValue({ items: [queuedJob] });
    uploadApi.getJob.mockResolvedValue({ ...queuedJob, status: "PROCESSING" });

    const { unmount } = render(<Uploads />);

    // Flush the initial listJobs promise and state update
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Clear any calls from initial render side-effects
    uploadApi.getJob.mockClear();

    // Advance by just over one poll interval
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS + 100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadApi.getJob).toHaveBeenCalledWith("poll-job-1");

    unmount();
    vi.useRealTimers();
  });

  it("does not poll when all jobs are in terminal states", async () => {
    vi.useFakeTimers();

    const doneJob = {
      jobId: "done-job-1",
      filename: "done.pdf",
      fileType: "pdf",
      status: "SUCCEEDED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    uploadApi.listJobs.mockResolvedValue({ items: [doneJob] });

    const { unmount } = render(<Uploads />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    uploadApi.getJob.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(uploadApi.getJob).not.toHaveBeenCalled();

    unmount();
    vi.useRealTimers();
  });
});

describe("Uploads – elections", () => {
  it("requires election selection before submitting", async () => {
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-no-election",
      upload: {
        url: "https://s3.example.com/presigned",
        fields: { key: "uploads/sub1/test-job-no-election/report.pdf" },
      },
      s3Key: "uploads/sub1/test-job-no-election/report.pdf",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);
    await waitFor(() => screen.getByText(/Upload 1 file/));

    setRequiredPconCode();
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(screen.getByText(/Election selection is required/)).toBeInTheDocument();
    });
    expect(uploadApi.createJob).not.toHaveBeenCalled();
  });

  it("shows no-elections state and allows Other / Not listed", async () => {
    uploadApi.listElections.mockResolvedValueOnce({ items: [] });
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-other",
      upload: {
        url: "https://s3.example.com/presigned",
        fields: { key: "uploads/sub1/test-job-other/report.pdf" },
      },
      s3Key: "uploads/sub1/test-job-other/report.pdf",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);
    await waitFor(() => screen.getByText(/Upload 1 file/));

    setRequiredPconCode();
    await waitFor(() => {
      expect(screen.getByText(/No elections configured for this constituency/)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/^Election$/i), {
      target: { value: "OTHER" },
    });
    expect(screen.getByLabelText(/Manual review reason/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload 1 file/)).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Manual review reason/i), {
      target: { value: "Election is not yet configured for this ward set." },
    });
    expect(screen.getByText(/Upload 1 file/)).not.toBeDisabled();
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(uploadApi.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          pconCode: "E14000637",
          electionId: "OTHER",
          manualReviewReason: "Election is not yet configured for this ward set.",
        })
      );
    });
  });
});

// Expose the constant so the test can reference it without import
const POLL_INTERVAL_MS = 5000;
