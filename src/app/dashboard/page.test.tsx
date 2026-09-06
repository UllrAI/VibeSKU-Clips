import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import type { BatchProgress, ProductionSummary } from "@/lib/ugc/queries";

const mockGetProductionSummary = jest.fn();
const mockListBatches = jest.fn();

const summary: ProductionSummary = {
  readyClips: 12,
  failedClips: 2,
  awaitingReview: 5,
  selectedClips: 4,
  runningBatches: 1,
  creditsSpent: 340,
  productsNeedingInput: 1,
};

function batch(): BatchProgress {
  return {
    batch: {
      id: "batch-1",
      userId: "user-123",
      name: "March restock",
      accountTag: null,
      config: { items: [], reviewScriptsFirst: false },
      plannedCount: 20,
      estimatedCredits: 220,
      status: "running",
      taskRunId: null,
      createdAt: new Date("2026-03-06T00:00:00.000Z"),
      updatedAt: new Date("2026-03-06T00:00:00.000Z"),
    },
    total: 20,
    ready: 12,
    failed: 2,
    running: 6,
    pending: 0,
  };
}

// The page module is required after the mocks are registered, and the module
// registry is deliberately not reset so React stays a single instance.
function loadPageModule() {
  jest.doMock("@/lib/metadata", () => ({
    createMetadataDefaults: () => ({}),
  }));
  jest.doMock("@/lib/i18n/server-locale", () => ({
    getRequestLocale: async () => "en",
  }));
  jest.doMock("@/lib/ugc/queries", () => ({
    getProductionSummary: () => mockGetProductionSummary(),
    listBatches: () => mockListBatches(),
  }));
  jest.doMock("next/link", () => ({
    __esModule: true,
    default: ({
      children,
      href,
    }: {
      children: React.ReactNode;
      href: string;
    }) => <a href={href}>{children}</a>,
  }));
  jest.doMock("./_components/dashboard-page-wrapper", () => ({
    DashboardPageWrapper: ({
      title,
      description,
      actions,
      children,
    }: {
      title: React.ReactNode;
      description: React.ReactNode;
      actions?: React.ReactNode;
      children: React.ReactNode;
    }) => (
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
        {actions}
        {children}
      </div>
    ),
  }));

  return require("./page") as typeof import("./page");
}

describe("Dashboard Home Page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProductionSummary.mockResolvedValue(summary);
    mockListBatches.mockResolvedValue([batch()]);
  });

  it("generates metadata from the production overview copy", async () => {
    const { generateMetadata } = loadPageModule();

    await expect(generateMetadata()).resolves.toMatchObject({
      title: "Production overview",
      description:
        "Where every batch stands, and what needs a decision from you.",
    });
  });

  it("renders production totals, attention items, and recent batches", async () => {
    const Page = loadPageModule().default;

    render(await Page());

    expect(screen.getByText("Production overview")).toBeInTheDocument();
    expect(screen.getByText("Clips delivered")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(
      screen.getByText("1 products are waiting for a link or an image."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 clips failed and can be retried."),
    ).toBeInTheDocument();
    expect(screen.getByText("March restock")).toBeInTheDocument();
    expect(
      screen.getByText("12 of 20 delivered · 2 failed"),
    ).toBeInTheDocument();
  });

  it("invites the operator to start a batch when none exist", async () => {
    mockListBatches.mockResolvedValue([]);
    const Page = loadPageModule().default;

    render(await Page());

    expect(screen.getByText("No batches yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add a product, then submit your first batch."),
    ).toBeInTheDocument();
  });
});
