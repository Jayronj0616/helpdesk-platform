// Minimal CSV writer for exports. Two things matter here:
//  1. Quoting: cells with commas, quotes or line breaks are wrapped in quotes, and quotes are doubled.
//  2. Formula injection: a cell that starts with = + - @ (or a tab or carriage return) is run as a formula
//     by Excel and Google Sheets, so a ticket titled =HYPERLINK("http://evil","click") would execute for
//     whoever opens the export. Such cells get a leading apostrophe, which spreadsheets show as plain text.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** Rows as CSV text with CRLF line endings and a UTF-8 byte order mark, so Excel reads accents correctly. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
