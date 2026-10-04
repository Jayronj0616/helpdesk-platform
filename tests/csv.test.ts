import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { seedDatabase } from "@/lib/dataverse/seed";
import { hasFilters, parseTicketFilters } from "@/lib/dataverse/queries";

describe("csvCell", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Laptop will not boot")).toBe("Laptop will not boot");
    expect(csvCell(1001)).toBe("1001");
    expect(csvCell(true)).toBe("true");
  });

  it("writes null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells with commas, quotes or line breaks, doubling the quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("neutralises spreadsheet formulas with a leading apostrophe", () => {
    for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell('=HYPERLINK("http://evil.example","click")')).toBe('"\'=HYPERLINK(""http://evil.example"",""click"")"');
  });

  it("does not touch a dash or equals sign in the middle of text", () => {
    expect(csvCell("re-open a=b")).toBe("re-open a=b");
    expect(csvCell("2026-10-04")).toBe("2026-10-04");
  });
});

describe("toCsv", () => {
  it("starts with a byte order mark and uses CRLF line endings, ending with one", () => {
    const out = toCsv(["A", "B"], [[1, "x"], [2, "y,z"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('A,B\r\n1,x\r\n2,"y,z"\r\n');
  });

  it("writes just the header for no rows", () => {
    expect(toCsv(["A"], []).slice(1)).toBe("A\r\n");
  });
});

describe("parseTicketFilters", () => {
  const db = seedDatabase();

  it("reads valid values", () => {
    expect(parseTicketFilters({ q: "vpn", status: "waiting", priority: "high", category: "c3", assignee: "none", overdue: "1", sort: "due" }, db)).toEqual({
      q: "vpn", status: "waiting", priority: "high", categoryId: "c3", assignee: "none", overdue: true, sort: "due",
    });
  });

  it("ignores values that are not valid options", () => {
    const f = parseTicketFilters({ status: "zzz", priority: "urgent", category: "nope", sort: "random", overdue: "yes" }, db);
    expect(f).toMatchObject({ status: undefined, priority: undefined, categoryId: undefined, sort: undefined, overdue: false });
  });

  it("ignores repeated parameters, which arrive as arrays", () => {
    expect(parseTicketFilters({ q: ["a", "b"], status: ["new", "closed"] }, db)).toMatchObject({ q: undefined, status: undefined });
  });

  it("hasFilters tells whether anything narrows the list", () => {
    expect(hasFilters(parseTicketFilters({}, db))).toBe(false);
    expect(hasFilters(parseTicketFilters({ sort: "due" }, db))).toBe(false); // sorting is not filtering
    expect(hasFilters(parseTicketFilters({ overdue: "1" }, db))).toBe(true);
  });
});
