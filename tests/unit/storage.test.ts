import { describe, expect, it } from "vitest";
import {
  contentDispositionHeader,
  extractExtension,
  isAllowedExtension,
  isAllowedMimeForExtension,
  canonicalContentType,
} from "../../src/lib/storage";

describe("extractExtension / isAllowedExtension", () => {
  it("extracts a lowercase extension", () => {
    expect(extractExtension("議案第5号.PDF")).toBe("pdf");
  });

  it("returns empty string when there is no extension", () => {
    expect(extractExtension("noext")).toBe("");
  });

  it("rejects extensions outside the whitelist", () => {
    expect(isAllowedExtension("exe")).toBe(false);
    expect(isAllowedExtension("html")).toBe(false);
    expect(isAllowedExtension("pdf")).toBe(true);
  });
});

describe("isAllowedMimeForExtension / canonicalContentType", () => {
  it("accepts the canonical MIME for pdf", () => {
    expect(isAllowedMimeForExtension("pdf", "application/pdf")).toBe(true);
  });

  it("rejects a mismatched MIME (renamed html file pretending to be pdf)", () => {
    expect(isAllowedMimeForExtension("pdf", "text/html")).toBe(false);
  });

  it("never trusts the uploaded MIME for storage; canonicalContentType always derives from extension", () => {
    expect(canonicalContentType("pdf")).toBe("application/pdf");
    expect(canonicalContentType("csv")).toBe("text/csv");
  });
});

describe("contentDispositionHeader", () => {
  it("strips quotes and newlines from the ASCII fallback filename (header injection defense)", () => {
    const header = contentDispositionHeader('evil".pdf\r\nX-Injected: 1');
    expect(header).not.toMatch(/\r|\n/);
    // filename="..." の中に生の `"` が残っていれば正規表現が非貪欲マッチで途中で閉じてしまうため、
    // キャプチャした中身に `"` が含まれないことを確認して「引用符から脱出できない」ことを検証する。
    const match = header.match(/filename="([^"]*)"/);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toContain('"');
  });

  it("encodes non-ASCII filenames via RFC 5987 filename*", () => {
    const header = contentDispositionHeader("議案第5号.pdf");
    expect(header).toContain("filename*=UTF-8''%E8%AD%B0%E6%A1%88%E7%AC%AC5%E5%8F%B7.pdf");
  });
});
