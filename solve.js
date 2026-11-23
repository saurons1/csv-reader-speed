// Fast drop-in for csv-reader 1.0.0: returns exactly csv-reader's answer
// {columns, rows, errors} for every input {text, header}.
//
// Strategy: avoid the reference's per-character loop. Unquoted fields are
// scanned with a single regex pass that stops at the first delimiter
// (comma / CR / LF) instead of walking every character; quoted fields use
// indexOf('"') to jump straight to the next quote and slice() whole
// segments instead of building strings a character at a time. All of
// csv-reader's broken-row rules (stray_cr, quote_junk,
// unterminated_quote, short_row, long_row, line/row bookkeeping) are
// reproduced exactly, including error order.

// End codes for a field: 0 = ended at a comma, 1 = ended at a line break,
// 2 = ended at the end of the text.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and its index in rows
  // (null for the header). Field scanners push errors against these.
  let recLine = 1;
  let recRow = null;
  // The field the last scan produced, and how many characters the last
  // unquoted scan appended (used for the quote_junk check).
  let fieldValue = '';
  let fieldAdded = 0;

  // One regex, reused: finds the next unquoted delimiter from lastIndex.
  const DELIM = /[,\r\n]/g;

  // Reads an unquoted field starting at pos, onto `init`. Returns the end
  // code and sets fieldValue / fieldAdded. A CR not followed by LF is
  // dropped (stray_cr) and the field continues.
  function scanUnquoted(init) {
    let value = init;
    let added = 0;
    let start = pos;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        if (start < n) {
          value += text.slice(start);
          added += n - start;
        }
        pos = n;
        fieldValue = value;
        fieldAdded = added;
        return 2;
      }
      const i = m.index;
      const c = text.charCodeAt(i);
      if (c === 44) {
        // ','
        value += text.slice(start, i);
        added += i - start;
        pos = i + 1;
        fieldValue = value;
        fieldAdded = added;
        return 0;
      }
      if (c === 10) {
        // '\n'
        value += text.slice(start, i);
        added += i - start;
        pos = i + 1;
        line += 1;
        fieldValue = value;
        fieldAdded = added;
        return 1;
      }
      // '\r'
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        value += text.slice(start, i);
        added += i - start;
        pos = i + 2;
        line += 1;
        fieldValue = value;
        fieldAdded = added;
        return 1;
      }
      // Lone CR: error, drop it, keep reading the same field.
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      value += text.slice(start, i);
      added += i - start;
      pos = i + 1;
      start = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the end
  // code and sets fieldValue / fieldAdded.
  function scanQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let scan = pos + 1;
    for (;;) {
      const q = text.indexOf('"', scan);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        return scanUnquoted('"');
      }
      if (q > scan) {
        // Segment [scan, q): content of the quoted field. CRLF and lone CR
        // inside quotes each read as one LF, and count as one line each.
        const seg = text.slice(scan, q);
        const cr = seg.indexOf('\r');
        if (cr === -1) {
          let lf = seg.indexOf('\n');
          if (lf !== -1) {
            let count = 0;
            while (lf !== -1) {
              count += 1;
              lf = seg.indexOf('\n', lf + 1);
            }
            line += count;
          }
          value += seg;
        } else {
          const br = seg.match(/\r\n|\r|\n/g);
          if (br !== null) line += br.length;
          value += seg.replace(/\r\n?/g, '\n');
        }
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        // Doubled quote: one literal quote, keep reading.
        value += '"';
        scan = q + 2;
        continue;
      }
      // Closing quote.
      pos = q + 1;
      if (pos >= n) {
        fieldValue = value;
        fieldAdded = 0;
        return 2;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fieldValue = value;
        fieldAdded = 0;
        return 0;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fieldValue = value;
        fieldAdded = 0;
        return 1;
      }
      if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fieldValue = value;
        fieldAdded = 0;
        return 1;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const end = scanUnquoted(value);
      if (fieldAdded > 0) {
        errors.push({ code: 'quote_junk', line: recLine, row: recRow });
      }
      return end;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;
    const fields = [];
    let end;
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      end = lastQuoted ? scanQuoted() : scanUnquoted('');
      fields.push(fieldValue);
    } while (end === 0);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
