import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { DashboardPageHeader } from "./dashboard-page-header";

// Mock the UI components
jest.mock("@/components/ui/breadcrumb-client", () => ({
  Breadcrumb: ({ children }: { children: React.ReactNode }) => (
    <nav data-testid="breadcrumb">{children}</nav>
  ),
  BreadcrumbList: ({ children }: { children: React.ReactNode }) => (
    <ol data-testid="breadcrumb-list">{children}</ol>
  ),
  BreadcrumbItem: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <li data-testid="breadcrumb-item" className={className}>
      {children}
    </li>
  ),
  BreadcrumbLink: ({
    href,
    children,
  }: {
    href?: string;
    children: React.ReactNode;
  }) => (
    <a href={href} data-testid="breadcrumb-link">
      {children}
    </a>
  ),
  BreadcrumbPage: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <h1 data-testid="breadcrumb-page" className={className}>
      {children}
    </h1>
  ),
  BreadcrumbSeparator: ({ className }: { className?: string }) => (
    <span data-testid="breadcrumb-separator" className={className}>
      /
    </span>
  ),
}));

jest.mock("@/components/ui/separator", () => ({
  Separator: ({
    orientation,
    className,
  }: {
    orientation?: string;
    className?: string;
  }) => (
    <div
      data-testid="separator"
      data-orientation={orientation}
      className={className}
    />
  ),
}));

jest.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: ({ className }: { className?: string }) => (
    <button data-testid="sidebar-trigger" className={className}>
      Menu
    </button>
  ),
}));

jest.mock("@/components/locale-switcher", () => ({
  LocaleSwitcher: () => <button data-testid="locale-switcher">Language</button>,
}));

jest.mock("@/components/mode-toggle", () => ({
  ModeToggle: () => <button data-testid="mode-toggle">Theme</button>,
}));

describe("DashboardPageHeader", () => {
  it("should render with required props", () => {
    render(<DashboardPageHeader title="Test Title" />);

    expect(screen.getByRole("banner")).toHaveClass("h-(--header-height)");
    expect(screen.getByTestId("breadcrumb-page")).toHaveTextContent(
      "Test Title",
    );
    expect(screen.getByTestId("sidebar-trigger")).toBeInTheDocument();
  });

  it("should render with parent title and URL", () => {
    render(
      <DashboardPageHeader
        title="Child Page"
        parentTitle="Parent Page"
        parentUrl="/parent"
      />,
    );

    expect(screen.getByTestId("breadcrumb-link")).toHaveTextContent(
      "Parent Page",
    );
    expect(screen.getByTestId("breadcrumb-link")).toHaveAttribute(
      "href",
      "/parent",
    );
    expect(screen.getByTestId("breadcrumb-separator")).toBeInTheDocument();
    expect(screen.getByTestId("breadcrumb-page")).toHaveTextContent(
      "Child Page",
    );
  });

  it("keeps appearance and language in the top right of every page", () => {
    render(<DashboardPageHeader title="Test Title" />);

    expect(screen.getByTestId("locale-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("mode-toggle")).toBeInTheDocument();
  });

  it("should hide sidebar trigger when showSidebarTrigger is false", () => {
    render(
      <DashboardPageHeader title="Test Title" showSidebarTrigger={false} />,
    );

    expect(screen.queryByTestId("sidebar-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("separator")).not.toBeInTheDocument();
  });

  it("should show sidebar trigger by default", () => {
    render(<DashboardPageHeader title="Test Title" />);

    expect(screen.getByTestId("sidebar-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("separator")).toBeInTheDocument();
  });

  it("should render with all props", () => {
    render(
      <DashboardPageHeader
        title="Child Page"
        parentTitle="Parent Page"
        parentUrl="/parent"
        showSidebarTrigger={true}
      />,
    );

    expect(screen.getByTestId("breadcrumb-link")).toHaveTextContent(
      "Parent Page",
    );
    expect(screen.getByTestId("breadcrumb-page")).toHaveTextContent(
      "Child Page",
    );
    expect(screen.getByTestId("sidebar-trigger")).toBeInTheDocument();
  });

  it("should render breadcrumb without parent when parent not provided", () => {
    render(<DashboardPageHeader title="Test Title" />);

    expect(screen.queryByTestId("breadcrumb-link")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("breadcrumb-separator"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("breadcrumb-page")).toHaveTextContent(
      "Test Title",
    );
  });

  it("should apply correct CSS classes", () => {
    render(<DashboardPageHeader title="Test Title" />);

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("flex", "h-(--header-height)");
    expect(header).not.toHaveClass("mb-2");

    const breadcrumbPage = screen.getByTestId("breadcrumb-page");
    expect(breadcrumbPage).toHaveClass("font-semibold");
  });
});
