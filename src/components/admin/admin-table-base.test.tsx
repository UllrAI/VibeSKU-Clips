import { fireEvent, render, screen } from "@testing-library/react";
import { AdminTableBase } from "./admin-table-base";

describe("AdminTableBase", () => {
  it("forwards controlled search changes immediately", () => {
    const onSearchChange = jest.fn();

    render(
      <AdminTableBase
        columns={[{ key: "name", label: "Name" }]}
        data={[]}
        loading={false}
        error={false}
        searchTerm="initial"
        onSearchChange={onSearchChange}
        pagination={{ page: 1, limit: 20, total: 0, totalPages: 1 }}
        onPageChange={jest.fn()}
      />,
    );

    const searchInput = screen.getByRole("textbox");
    expect(searchInput).toHaveValue("initial");

    fireEvent.change(searchInput, { target: { value: "updated" } });

    expect(onSearchChange).toHaveBeenCalledWith("updated");
  });

  it("keeps headers and cells on the same declared alignment", () => {
    render(
      <AdminTableBase
        columns={[
          { key: "name", label: "Name" },
          {
            key: "count",
            label: "Count",
            align: "right",
            sticky: "right",
          },
        ]}
        data={[{ id: "one", name: "First", count: 12 }]}
        loading={false}
        error={false}
        searchTerm=""
        onSearchChange={jest.fn()}
        pagination={{ page: 1, limit: 20, total: 1, totalPages: 1 }}
        onPageChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Count" })).toHaveClass(
      "text-right",
      "align-middle",
      "sticky",
      "right-0",
    );
    expect(screen.getByRole("cell", { name: "12" })).toHaveClass(
      "text-right",
      "align-middle",
      "sticky",
      "right-0",
    );
  });

  it("shows and labels the active select filter", () => {
    render(
      <AdminTableBase
        columns={[{ key: "name", label: "Name" }]}
        data={[]}
        loading={false}
        error={false}
        searchTerm=""
        onSearchChange={jest.fn()}
        filterValue="all"
        onFilterChange={jest.fn()}
        filterOptions={[{ value: "all", label: "All roles" }]}
        filterPlaceholder="Filter by role"
        pagination={{ page: 1, limit: 20, total: 0, totalPages: 1 }}
        onPageChange={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Filter by role" }),
    ).toHaveTextContent("All roles");
  });
});
