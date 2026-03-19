import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/uploadApi.js", () => ({
  createJob: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  getDownloadUrls: vi.fn(),
}));

vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: { from: vi.fn() },
}));

import * as uploadApi from "../../lib/uploadApi.js";
import { supabase } from "../../lib/supabaseClient.js";
import Uploads from "./Uploads.jsx";

// Expose the constant so the test can reference it without import
const POLL_INTERVAL_MS = 5000;

const DEFAULT_ELECTIONS = [
  { id: "ge2024-uuid", election_date: "2024-07-04", election_type: "general" },
  { id: "local2026-uuid", election_date: "2026-05-07", election_type: "local" },
];

function makeElectionsMock(data = DEFAULT_ELECTIONS) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  };
}

function makeConstituenciesMock(data = []) {
  return {
    select: vi.fn().mockReturnValue({
      ilike: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function setupSupabaseMock({ elections = DEFAULT_ELECTIONS } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === "elections") return makeElectionsMock(elections);
    return makeConstituenciesMock([]);
  });
}

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
async function stageFileAndSelectConstituency(name, onsCode) {
  // Stage a file so the form appears
  const fileInput = document.querySelector('input[type="file"]');
  setInputFiles(fileInput, [makeFile("report.pdf", "application/pdf")]);

  // Flush state update so form renders
  await act(async () => {
    await Promise.resolve();
  });

  // Set up constituency mock for the search
  supabase.from.mockImplementationOnce(() =>
    makeConstituenciesMock([{ id: "c1", ons_code: onsCode, name }])
  );

  // Type in the constituency search box
  const searchInput = screen.getByLabelText(/Search constituency/i);
  fireEvent.change(searchInput, { target: { value: name } });

  // Advance past the 300ms debounce
  act(() => {
    vi.advanceTimersByTime(400);
  });

  // Flush promises from the supabase search call
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // Click the result
  const option = screen.getByRole("option", { name });
  fireEvent.click(option);
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadApi.listJobs.mockResolvedValue({ items: [] });
  setupSupabaseMock();
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

    // Flush initial data fetches (listJobs + elections)
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

    fireEvent.click(screen.getByText(/Upload 1 file/));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadApi.createJob).toHaveBeenCalledWith({
      filename: "report.pdf",
      pconCode: "E14000637",
      electionId: "ge2024-uuid",
      fileType: "pdf",
      size: 1024,
      metadata: { clientName: "Greenfield Association", notes: "Urgent batch" },
    });
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

    // Override to stage a CSV file
    const fileInput = document.querySelector('input[type="file"]');
    setInputFiles(fileInput, [makeFile("data.csv", "text/csv")]);
    await act(async () => { await Promise.resolve(); });

    supabase.from.mockImplementationOnce(() =>
      makeConstituenciesMock([{ id: "c1", ons_code: "E14000637", name: "Exeter" }])
    );
    const searchInput = screen.getByLabelText(/Search constituency/i);
    fireEvent.change(searchInput, { target: { value: "Exeter" } });
    act(() => { vi.advanceTimersByTime(400); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("option", { name: "Exeter" }));

    fireEvent.click(screen.getByText(/Upload 1 file/));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bucket.s3.amazonaws.com",
      expect.objectContaining({ method: "POST" })
    );

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("key")).toBe("uploads/sub1/test-job-2/data.csv");
    expect(options.body.get("file")).toBeInstanceOf(File);
  });

  it("shows the new job in the table after a successful upload", async () => {
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
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

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
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByText(/S3 upload failed/)).toBeInTheDocument();
  });

  it("shows error when constituency not selected before uploading", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    await waitFor(() => screen.getByText(/Upload 1 file/));
    fireEvent.click(screen.getByText(/Upload 1 file/));

    await waitFor(() => {
      expect(screen.getByText(/Constituency is required/)).toBeInTheDocument();
    });
    expect(uploadApi.createJob).not.toHaveBeenCalled();
  });
});

// ── Polling ────────────────────────────────────────────────────────────────

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    uploadApi.getJob.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS + 100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadApi.getJob).toHaveBeenCalledWith("poll-job-1");
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

    uploadApi.getJob.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(uploadApi.getJob).not.toHaveBeenCalled();
    unmount();
  });
});

// ── Elections ──────────────────────────────────────────────────────────────

describe("Uploads – elections", () => {
  it("loads elections from Supabase and defaults to 2024 General Election", async () => {
    render(<Uploads />);
    await waitFor(() => expect(uploadApi.listJobs).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    setInputFiles(input, [makeFile("report.pdf", "application/pdf")]);

    await waitFor(() => {
      const select = screen.getByLabelText(/^Election$/i);
      expect(select.value).toBe("ge2024-uuid");
    });
  });

  it("requires election selection when no elections loaded", async () => {
    // No elections returned → no auto-select → electionId remains ""
    setupSupabaseMock({ elections: [] });
    vi.useFakeTimers();

    render(<Uploads />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await stageFileAndSelectConstituency("Exeter", "E14000637");
    fireEvent.click(screen.getByText(/Upload 1 file/));
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText(/Election selection is required/)).toBeInTheDocument();
    expect(uploadApi.createJob).not.toHaveBeenCalled();
  });

  it("shows Other / Not listed option and requires manual review reason", async () => {
    vi.useFakeTimers();

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
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await stageFileAndSelectConstituency("Exeter", "E14000637");

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

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(uploadApi.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        pconCode: "E14000637",
        electionId: "OTHER",
        manualReviewReason: "Election is not yet configured for this ward set.",
      })
    );
  });
});
