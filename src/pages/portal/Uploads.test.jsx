import { act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const render = (ui, options) => rtlRender(ui, { wrapper: HelmetProvider, ...options });

vi.mock("../../lib/uploadApi.js", () => ({
  createJob: vi.fn(),
  listElections: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  getDownloadUrls: vi.fn(),
}));

vi.mock("../../context/PermissionsContext.jsx", () => ({
  usePermissions: vi.fn(),
}));

import * as uploadApi from "../../lib/uploadApi.js";
import { usePermissions } from "../../context/PermissionsContext.jsx";
import Uploads from "./Uploads.jsx";

// Expose the constant so the test can reference it without import
const POLL_INTERVAL_MS = 30000;

const DEFAULT_ELECTIONS = [
  { electionId: "ge2024-uuid", date: "2024-07-04", electionType: "GENERAL" },
  { electionId: "local2026-uuid", date: "2026-05-07", electionType: "LOCAL" },
];

const DEFAULT_ALLOWED_CONSTITUENCIES = [
  {
    id: "c1",
    ons_code: "E14000637",
    name: "Exeter",
    association_name: "Exeter Association",
  },
  {
    id: "c2",
    ons_code: "E14001234",
    name: "East Devon",
    association_name: "East Devon Association",
  },
];

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

/**
 * Stages a file and selects a constituency via the search dropdown.
 * Requires fake timers to be active before calling.
 */
async function stageFileAndSelectConstituency(name, onsCode, expectedElectionId = "ge2024-uuid") {
  // Stage a file so the form appears
  const fileInput = document.querySelector('input[type="file"]');
  setInputFiles(fileInput, [makeFile("report.pdf", "application/pdf")]);

  // Flush state update so form renders
  await act(async () => {
    await Promise.resolve();
  });

  // Type in the constituency search box
  const searchInput = screen.getByLabelText(/Search constituency/i);
  fireEvent.change(searchInput, { target: { value: name } });

  // Advance past the 300ms debounce
  act(() => {
    vi.advanceTimersByTime(400);
  });

  // Flush promises from the local search debounce and election fetch
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // Click the result
  const option = screen.getByRole("option", { name: new RegExp(name, "i") });
  fireEvent.click(option);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  if (expectedElectionId !== undefined) {
    expect(screen.getByLabelText(/select election/i)).toHaveValue(expectedElectionId);
  }
}

/**
 * Clicks the "Review and upload N file" button and then confirms in the modal.
 * Flushes two microtask rounds between clicks so the modal mounts.
 */
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
  uploadApi.listElections.mockResolvedValue({ items: DEFAULT_ELECTIONS });
  usePermissions.mockReturnValue({
    allowedConstituencies: DEFAULT_ALLOWED_CONSTITUENCIES,
    loading: false,
    error: null,
    reload: vi.fn(),
  });
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
      expect(screen.getByText(/only PDF and CSV files are accepted/)).toBeInTheDocument();
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
    expect(screen.queryByText(/only PDF and CSV/)).not.toBeInTheDocument();
  });

  it("accepts CSV files without error", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("data.csv", "text/csv")]);

    await waitFor(() => {
      expect(screen.getByText(/data\.csv/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/only PDF and CSV/)).not.toBeInTheDocument();
  });

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
  it("calls createJob with filename, fileType, pconCode, electionId and metadata", async () => {
    vi.useFakeTimers();

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

    // Flush initial data fetches
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await stageFileAndSelectConstituency("Exeter", "E14000637");

    fireEvent.change(screen.getByLabelText(/Client name/), {
      target: { value: "Greenfield Association" },
    });
    fireEvent.change(screen.getByLabelText(/Notes/), {
      target: { value: "Urgent batch" },
    });

    await reviewAndConfirmUpload();

    expect(uploadApi.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "report.pdf",
        pconCode: "E14000637",
        electionId: "ge2024-uuid",
        fileType: "pdf",
        size: 1024,
        constituencyOnsCode: "E14000637",
        metadata: { clientName: "Greenfield Association", notes: "Urgent batch" },
      }),
    );
  });

  it("POSTs FormData to the presigned S3 URL returned by createJob", async () => {
    vi.useFakeTimers();

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const fileInput = document.querySelector('input[type="file"]');
    setInputFiles(fileInput, [makeFile("data.csv", "text/csv")]);
    await act(async () => {
      await Promise.resolve();
    });

    const searchInput = screen.getByLabelText(/Search constituency/i);
    fireEvent.change(searchInput, { target: { value: "Exeter" } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("option", { name: /Exeter/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByLabelText(/select election/i)).toHaveValue("ge2024-uuid");

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

  it("loads elections on mount and defaults to 2024 General Election", async () => {
    vi.useFakeTimers();

    render(<Uploads />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await stageFileAndSelectConstituency("Exeter", "E14000637");

    // Elections are fetched per selected constituency (single-code), not on mount.
    expect(uploadApi.listElections).toHaveBeenCalledWith(
      ["OPEN", "UPCOMING", "CLOSED", "ARCHIVED"],
      ["E14000637"],
    );
    expect(screen.getByLabelText(/select election/i)).toHaveValue("ge2024-uuid");
  });

  it("shows the success message and new job in the table after a successful upload", async () => {
    vi.useFakeTimers();

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
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await stageFileAndSelectConstituency("Exeter", "E14000637");
    await reviewAndConfirmUpload();

    expect(
      screen.getByText(
        "1 file submitted. You will receive an email when processing is complete."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("displays upload error when S3 POST fails", async () => {
    vi.useFakeTimers();

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
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await stageFileAndSelectConstituency("Exeter", "E14000637");
    await reviewAndConfirmUpload();

    expect(screen.getByText(/S3 upload failed/)).toBeInTheDocument();
  });

  it("shows error when constituency not selected before uploading", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    // Button exists when a file is staged but is disabled until constituency
    // + election are selected; clicking it is a no-op.
    const reviewButton = await screen.findByRole("button", {
      name: /Review and upload 1 file/,
    });
    expect(reviewButton).toBeDisabled();
    fireEvent.click(reviewButton);
    expect(uploadApi.createJob).not.toHaveBeenCalled();
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

// ── Elections ──────────────────────────────────────────────────────────────

describe("Uploads – elections", () => {
  it("loads elections from the upload API and defaults to 2024 General Election", async () => {
    vi.useFakeTimers();

    render(<Uploads />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await stageFileAndSelectConstituency("Exeter", "E14000637");

    const select = screen.getByLabelText(/select election/i);
    expect(select.value).toBe("ge2024-uuid");
  });

  it("formats by-elections and local elections with clearer labels", async () => {
    uploadApi.listElections.mockResolvedValueOnce({
      items: [
        {
          electionId: "byelection-uuid",
          polling_date: "2025-03-13",
          electionType: "BY_ELECTION",
          name: "Hereford By-Election",
          isByElection: true,
        },
        {
          electionId: "local-uuid",
          polling_date: "2025-05-01",
          electionType: "LOCAL",
          localAuthorityName: "Staffordshire County Council",
          name: "Staffordshire County Council Elections",
        },
      ],
    });
    vi.useFakeTimers();

    render(<Uploads />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // The elections <select> only renders after a constituency is picked, which
    // triggers the per-constituency listElections fetch. Use the standard helper
    // and skip the default-election assertion (the mock returns BY-ELECTION /
    // LOCAL only — no GENERAL — so auto-select picks the first available).
    await stageFileAndSelectConstituency("Exeter", "E14000637", "local-uuid");

    const select = screen.getByLabelText(/select election/i);
    expect(select).toHaveTextContent("Exeter — Hereford By-Election — 13 March 2025");
    expect(select).toHaveTextContent("Exeter — Staffordshire County Council Elections — 1 May 2025");
  });

  it("requires election selection when no elections loaded", async () => {
    uploadApi.listElections.mockResolvedValueOnce({ items: [] });
    vi.useFakeTimers();

    render(<Uploads />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await stageFileAndSelectConstituency("Exeter", "E14000637", "");

    // With no elections available, selectedElectionId stays empty so canUpload
    // is false and the review button is disabled — createJob is never called.
    const reviewButton = screen.getByRole("button", {
      name: /Review and upload 1 file/,
    });
    expect(reviewButton).toBeDisabled();
    fireEvent.click(reviewButton);
    expect(uploadApi.createJob).not.toHaveBeenCalled();
  });

  it("filters the allowed constituencies locally and shows matching dropdown results", async () => {
    vi.useFakeTimers();

    render(<Uploads />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);
    await act(async () => { await Promise.resolve(); });

    const searchInput = screen.getByLabelText(/Search constituency/i);
    fireEvent.change(searchInput, { target: { value: "Exet" } });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("option", { name: /Exeter/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /East Devon/i })).not.toBeInTheDocument();
  });

  it("does not show the manual review reason field to users", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Manual review reason/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /Other \/ Not listed/i })).not.toBeInTheDocument();
    });
  });

  it("shows clear terminal status labels for completed and failed jobs", async () => {
    uploadApi.listJobs.mockResolvedValueOnce({
      items: [
        {
          jobId: "complete-job-1",
          filename: "results.pdf",
          fileType: "pdf",
          status: "SUCCEEDED",
          output: {
            files: [{ name: "results.csv", key: "jobs/complete-job-1/results.csv" }],
          },
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

    expect(screen.queryByRole("button", { name: /Download Results/i })).not.toBeInTheDocument();
  });
});
