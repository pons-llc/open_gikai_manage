import { describe, expect, it } from "vitest";
import { announcementSchema, datetimeLocalToDb, dbToDatetimeLocal } from "../../src/validators/announcements";

describe("announcementSchema.related_url", () => {
  const base = { subject: "件名", body: "本文", published_at: "" };

  it("accepts an empty related_url", () => {
    const result = announcementSchema.safeParse({ ...base, related_url: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.related_url).toBeNull();
  });

  it("accepts https URLs", () => {
    const result = announcementSchema.safeParse({ ...base, related_url: "https://example.jp/news" });
    expect(result.success).toBe(true);
  });

  it("rejects javascript: URLs (XSS via <a href>)", () => {
    const result = announcementSchema.safeParse({ ...base, related_url: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects data: URLs", () => {
    const result = announcementSchema.safeParse({ ...base, related_url: "data:text/html,<script>1</script>" });
    expect(result.success).toBe(false);
  });
});

describe("datetime-local <-> DB format conversion", () => {
  it("round-trips through both directions", () => {
    const db = datetimeLocalToDb("2026-07-10T09:30");
    expect(db).toBe("2026-07-10 09:30:00");
    expect(dbToDatetimeLocal(db)).toBe("2026-07-10T09:30");
  });

  it("treats empty input as empty (caller falls back to datetime('now'))", () => {
    expect(datetimeLocalToDb("")).toBe("");
  });
});
