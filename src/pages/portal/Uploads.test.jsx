import { act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const render = (ui, options) => rtlRender(ui, { wrapper: HelmetProvider, ...options });

vi.mock("../../lib/uploadApi.js", () => ({
  createJob: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  getDownloadUrls: vi.fn(),
}));

import * as uploadApi from "../../lib/uploadApi.js";
import Uploads from "./Uploads.jsx";

const POLL_INTERVAL_MS = 30000;

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

function fillRequiredFields(overrides = {}) {
  const values = {
    "Association / Federation": "Staffordshire South Conservative Association",
    Constituency: "Stone, Great Wyrley and Penkridge",
    "Council Area": "South Staffordshire District Council",
    Election: "2024 General Election",
    "Date of Election": "04 July 2024",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  return values;
}

async function reviewAndConfirmUpload() {
  fireEvent.click(screen.getByText(/Review and upload \d+ files?/));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: /Confirm and Upload/i }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadApi.listJobs.mockResolvedValue({ items: [] });
});

afterEach(() => {
  delete global.fetch;
  vi.useRealTimers();
});

// ── File validation ────────────────────────────────────────────────────────

describe("Uploads – file validation", () => {
  it("shows an error for unsupported file types", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [
      makeFile(
        "report.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/only PDF, CSV, and XLSX files are accepted/)).toBeInTheDocument();
    });
  });

  it("accepts PDF files without error", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("document.pdf", "application/pdf")]);

    await waitFor(() => {
      expect(screen.getByText(/document\.pdf/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF, CSV, and XLSX/)).not.toBeInTheDocument();
  });

  it("accepts CSV files without error", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("data.csv", "text/csv")]);

    await waitFor(() => {
      expect(screen.getByText(/data\.csv/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF, CSV, and XLSX/)).not.toBeInTheDocument();
  });

  it("accepts XLSX files and advertises the canonical browser file types", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    expect(input.getAttribute("accept")).toContain(".xlsx");
    expect(input.getAttribute("accept")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    setInputFiles(input, [
      makeFile(
        "data.XLSX",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/data\.XLSX/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF, CSV, and XLSX/)).not.toBeInTheDocument();
  });

  it("accepts XLSX by extension when the browser supplies no MIME type", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("data.xlsx", "")]);

    await waitFor(() => {
      expect(screen.getByText(/data\.xlsx/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF, CSV, and XLSX/)).not.toBeInTheDocument();
  });

  it.each(["legacy.xls", "macro.xlsm"])(
    "rejects unsupported Excel format %s",
    async (filename) => {
      render(<Uploads />);
      await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

      const input = document.querySelector('input[type="file"]');
      setInputFiles(input, [makeFile(filename, "application/vnd.ms-excel")]);

      await waitFor(() => {
        expect(
          screen.getByText(/only PDF, CSV, and XLSX files are accepted/)
        ).toBeInTheDocument();
      });
    }
  );

  it("shows an error when a file exceeds 200 MB", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("huge.csv", "text/csv", 200 * 1024 * 1024 + 1)]);

    await waitFor(() => {
      expect(screen.getByText(/200 MB size limit/)).toBeInTheDocument();
    });
  });
});

// ── Upload flow ────────────────────────────────────────────────────────────

describe("Uploads – upload flow", () => {
  it("calls createJob with filename, fileType, and the five free-text fields", async () => {
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
    await waitFor(() => expect(screen.getByText(/report\.pdf/)).toBeInTheDocument());

    fillRequiredFields();
    await reviewAndConfirmUpload();

    expect(uploadApi.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "report.pdf",
        fileType: "pdf",
        size: 1024,
        association: "Staffordshire South Conservative Association",
        constituency: "Stone, Great Wyrley and Penkridge",
        councilArea: "South Staffordshire District Council",
        election: "2024 General Election",
        electionDate: "04 July 2024",
      }),
    );
  });

  it("creates XLSX jobs with the xlsx file type", async () => {
    uploadApi.createJob.mockResolvedValue({
      jobId: "test-job-xlsx",
      upload: {
        url: "https://bucket.s3.amazonaws.com",
        fields: {
          key: "uploads/sub1/test-job-xlsx/data.xlsx",
          policy: "abc",
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      },
      s3Key: "uploads/sub1/test-job-xlsx/data.xlsx",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [
      makeFile(
        "data.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
    ]);
    await waitFor(() => expect(screen.getByText(/data\.xlsx/)).toBeInTheDocument());

    fillRequiredFields();
    await reviewAndConfirmUpload();

    expect(uploadApi.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "data.xlsx",
        fileType: "xlsx",
        size: 1024,
      })
    );
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
    await waitFor(() => expect(screen.getByText(/data\.csv/)).toBeInTheDocument());

    fillRequiredFields();
    await reviewAndConfirmUpload();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bucket.s3.amazonaws.com",
      expect.objectContaining({ method: "POST" })
    );

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("key")).toBe("uploads/sub1/test-job-2/data.csv");
    expect(options.body.get("file")).toBeInstanceOf(File);
  });

  it("shows the success message and new job in the table after a successful upload", async () => {
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
    await waitFor(() => expect(screen.getByText(/report\.pdf/)).toBeInTheDocument());

    fillRequiredFields();
    await reviewAndConfirmUpload();

    expect(
      screen.getByText(
        "1 file submitted. You will receive an email when processing is complete."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByText(/report\.pdf/)).toBeInTheDocument());

    fillRequiredFields();
    await reviewAndConfirmUpload();

    expect(screen.getByText(/S3 upload failed/)).toBeInTheDocument();
  });

  it("disables the upload button until all five fields are populated", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    const reviewButton = await screen.findByRole("button", {
      name: /Review and upload 1 file/,
    });
    expect(reviewButton).toBeDisabled();

    fillRequiredFields({ Election: "" });
    expect(reviewButton).toBeDisabled();

    fillRequiredFields();
    expect(reviewButton).not.toBeDisabled();
  });
});

// ── Polling ────────────────────────────────────────────────────────────────

describe("Uploads – polling", () => {
  it("refreshes the jobs list every 30 seconds while jobs are in progress", async () => {
    vi.useFakeTimers();

    const queuedJob = {
      jobId: "poll-job-1",
      filename: "test.pdf",
      fileType: "pdf",
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    uploadApi.listJobs
      .mockResolvedValueOnce({ items: [queuedJob] })
      .mockResolvedValueOnce({ items: [{ ...queuedJob, status: "PROCESSING" }] });

    const { unmount } = render(<Uploads />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    uploadApi.listJobs.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS + 100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadApi.listJobs).toHaveBeenCalledWith(25);
    expect(screen.getByText("Processing")).toBeInTheDocument();
    unmount();
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

    uploadApi.listJobs.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS + 100);
      await Promise.resolve();
    });

    expect(uploadApi.listJobs).not.toHaveBeenCalled();
    unmount();
  });
});

// ── Job statuses ───────────────────────────────────────────────────────────

describe("Uploads – job status badges", () => {
  it("shows clear terminal status labels for completed and failed jobs", async () => {
    uploadApi.listJobs.mockResolvedValueOnce({
      items: [
        {
          jobId: "complete-job-1",
          filename: "results.pdf",
          fileType: "pdf",
          status: "SUCCEEDED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          jobId: "failed-job-1",
          filename: "failed.pdf",
          fileType: "pdf",
          status: "FAILED",
          error: { message: "OCR failed" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    render(<Uploads />);

    await waitFor(() => {
      expect(screen.getByText("Complete")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
  });
});
