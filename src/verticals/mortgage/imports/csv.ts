/** Maximum rows accepted in one import. Larger files should be split. */
export const MAX_IMPORT_ROWS = 1000;
/** Maximum file size read in the browser (characters). */
export const MAX_IMPORT_CHARACTERS = 2_000_000;

/**
 * Parses CSV text (RFC 4180): comma separated, double-quoted fields, doubled quotes, CRLF or LF line
 * endings, an optional UTF-8 byte-order mark. Returns the header row and data rows; blank lines are skipped.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  if (text.length > MAX_IMPORT_CHARACTERS) throw new Error("This file is too large. Split it into smaller files.");
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let field = "", record: string[] = [], quoted = false, sawQuote = false;
  const endField = () => { record.push(sawQuote ? field : field.trim()); field = ""; sawQuote = false; };
  const endRecord = () => { endField(); if (record.some(value => value !== "")) records.push(record); record = []; };
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') { if (source[index + 1] === '"') { field += '"'; index++; } else quoted = false; }
      else field += char;
    } else if (char === '"' && field.trim() === "") { quoted = true; sawQuote = true; field = ""; }
    else if (char === ",") endField();
    else if (char === "\n") endRecord();
    else if (char === "\r") { if (source[index + 1] === "\n") index++; endRecord(); }
    else field += char;
  }
  if (quoted) throw new Error("The file has an unclosed quote. Check it was exported as CSV.");
  if (field !== "" || record.length) endRecord();
  const [headers = [], ...rows] = records;
  if (!headers.length) throw new Error("The file is empty.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`This file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);
  return { headers: headers.map(header => header.trim()), rows: rows.map(row => headers.map((_, column) => (row[column] ?? "").trim())) };
}
