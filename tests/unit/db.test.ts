import { describe, expect, it } from "vitest";
import { containsPattern, escapeLikePattern } from "../../src/lib/db";

describe("escapeLikePattern / containsPattern", () => {
  it("escapes % so it is not treated as a wildcard", () => {
    expect(escapeLikePattern("100%完了")).toBe("100\\%完了");
  });

  it("escapes _ so it is not treated as a single-character wildcard", () => {
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("escapes a literal backslash first so escaping is not double-applied", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary text (including Japanese) untouched", () => {
    expect(escapeLikePattern("補正予算")).toBe("補正予算");
  });

  it("wraps the escaped value for a substring match", () => {
    expect(containsPattern("50%")).toBe("%50\\%%");
  });

  it("prevents an attacker from crafting an unintended match-everything pattern", () => {
    // ユーザー入力の % がそのまま渡ると LIKE '%%%' のような意図しない全件一致になりうる。
    // containsPattern を通せば、入力中の % はリテラル文字として扱われる。
    const pattern = containsPattern("%");
    expect(pattern).toBe("%\\%%");
  });
});
