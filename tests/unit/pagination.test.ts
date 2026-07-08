import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages } from "../../src/lib/pagination";

describe("parsePage", () => {
  it("defaults to 1 for missing/invalid input", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
  });

  it("parses a positive integer", () => {
    expect(parsePage("3")).toBe(3);
  });
});

describe("paginationOffset", () => {
  it("computes offset from page and page size", () => {
    expect(paginationOffset(1)).toBe(0);
    expect(paginationOffset(2)).toBe(ADMIN_PAGE_SIZE);
    expect(paginationOffset(3, 10)).toBe(20);
  });
});

describe("totalPages", () => {
  it("returns at least 1 even when there are zero rows", () => {
    expect(totalPages(0)).toBe(1);
  });

  it("rounds up to cover the remainder", () => {
    expect(totalPages(ADMIN_PAGE_SIZE + 1)).toBe(2);
    expect(totalPages(ADMIN_PAGE_SIZE * 2)).toBe(2);
  });
});

describe("buildPageHref", () => {
  it("omits ?page= for page 1", () => {
    expect(buildPageHref("/admin/members", {}, 1)).toBe("/admin/members");
  });

  it("adds ?page= for page > 1", () => {
    expect(buildPageHref("/admin/members", {}, 2)).toBe("/admin/members?page=2");
  });

  it("preserves existing filter/sort query params and overrides page", () => {
    const href = buildPageHref("/admin/agenda-items", { fiscal_year: "2026", category: "bill", page: "1" }, 3);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("fiscal_year")).toBe("2026");
    expect(params.get("category")).toBe("bill");
    expect(params.get("page")).toBe("3");
  });

  it("drops empty-string query values", () => {
    expect(buildPageHref("/admin/documents", { q: "", unlinked: undefined }, 2)).toBe("/admin/documents?page=2");
  });
});
