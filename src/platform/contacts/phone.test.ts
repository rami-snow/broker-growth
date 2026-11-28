import { describe, expect, it } from "vitest";
import { normalisePhoneNumber } from "./phone";

describe("phone matching", () => {
  it("treats spaces, brackets, dashes, +61, 0061, +61 (0) and a leading 0 as the same number", () => {
    for (const form of ["0400 111 222", "(04) 0011 1222", "0400-111-222", "+61 400 111 222", "+61400111222", "0061 400 111 222", "+61 (0) 400 111 222", "61 400 111 222"]) expect(normalisePhoneNumber(form)).toBe("0400111222");
    expect(normalisePhoneNumber("+61 2 9876 5432")).toBe(normalisePhoneNumber("(02) 9876 5432"));
  });
  it("leaves other numbers as digits and treats blanks as missing", () => {
    expect(normalisePhoneNumber("+64 21 123 4567")).toBe("64211234567");
    expect(normalisePhoneNumber("9876 5432")).toBe("98765432");
    expect(normalisePhoneNumber("  ")).toBeUndefined();
    expect(normalisePhoneNumber(undefined)).toBeUndefined();
  });
});
