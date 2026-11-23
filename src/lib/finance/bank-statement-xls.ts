import Papa from "papaparse";

/**
 * Reads the first sheet of an old-style Excel file (.xls, "BIFF8") into rows
 * of text, so a bank's .xls download goes through the same statement parser
 * as a CSV. Nothing here touches a bank login or keeps the file: it works on
 * bytes in memory and returns plain strings.
 *
 * Written by hand, with no dependency, on purpose: this reads bank files in a
 * finance system, and the maintained spreadsheet libraries are either
 * unavailable from the npm registry at a safe version or republished by
 * individuals. The format is small for what a statement needs — a compound
 * file container holding a stream of records — and only text and number cells
 * are understood. Dates stored as real Excel dates (rather than text, as banks
 * export them) come back as their serial number and are reported by the
 * statement parser as unreadable dates, never guessed.
 */

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREE = 0xfffffffe;
const END_OF_CHAIN = 0xfffffffe;

export function looksLikeXls(bytes: Uint8Array): boolean {
  return CFB_SIGNATURE.every((b, i) => bytes[i] === b);
}

export class XlsReadError extends Error {}

function u16(d: DataView, o: number): number {
  return d.getUint16(o, true);
}
function u32(d: DataView, o: number): number {
  return d.getUint32(o, true);
}

/** Follows a chain of sectors through a FAT and returns the bytes, in order. */
function readChain(
  data: Uint8Array,
  fat: Uint32Array,
  start: number,
  sectorSize: number,
  offsetOf: (sector: number) => number,
  limit: number,
): Uint8Array {
  const parts: Uint8Array[] = [];
  let sector = start;
  let guard = 0;
  while (sector < FREE && guard++ < limit) {
    const at = offsetOf(sector);
    if (at < 0 || at + sectorSize > data.length) throw new XlsReadError("The file is cut short or damaged.");
    parts.push(data.subarray(at, at + sectorSize));
    sector = fat[sector] ?? END_OF_CHAIN;
  }
  const out = new Uint8Array(parts.length * sectorSize);
  parts.forEach((p, i) => out.set(p, i * sectorSize));
  return out;
}

/** Pulls the workbook stream out of the compound file container. */
function workbookStream(data: Uint8Array): Uint8Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 512 || !looksLikeXls(data)) throw new XlsReadError("This is not an Excel (.xls) file.");

  const sectorSize = 1 << u16(view, 0x1e);
  const miniSize = 1 << u16(view, 0x20);
  const fatSectors = u32(view, 0x2c);
  const firstDirSector = u32(view, 0x30);
  const miniCutoff = u32(view, 0x38);
  const firstMiniFat = u32(view, 0x3c);
  const miniFatSectors = u32(view, 0x40);
  const firstDifat = u32(view, 0x44);
  const difatSectors = u32(view, 0x48);
  const offsetOf = (sector: number) => 512 + sector * sectorSize;
  const sectorLimit = Math.ceil(data.length / sectorSize) + 1;

  // Which sectors hold the FAT: 109 in the header, then more via the DIFAT chain.
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109 && fatSectorIds.length < fatSectors; i++) fatSectorIds.push(u32(view, 0x4c + i * 4));
  let difat = firstDifat;
  for (let n = 0; n < difatSectors && difat < FREE; n++) {
    const at = offsetOf(difat);
    if (at + sectorSize > data.length) throw new XlsReadError("The file is cut short or damaged.");
    const perSector = sectorSize / 4 - 1;
    for (let i = 0; i < perSector && fatSectorIds.length < fatSectors; i++) fatSectorIds.push(u32(view, at + i * 4));
    difat = u32(view, at + perSector * 4);
  }

  const fat = new Uint32Array((fatSectorIds.length * sectorSize) / 4);
  fatSectorIds.forEach((sector, i) => {
    const at = offsetOf(sector);
    if (at + sectorSize > data.length) throw new XlsReadError("The file is cut short or damaged.");
    for (let j = 0; j < sectorSize / 4; j++) fat[(i * sectorSize) / 4 + j] = u32(view, at + j * 4);
  });

  const dir = readChain(data, fat, firstDirSector, sectorSize, offsetOf, sectorLimit);
  const dirView = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  let root: { start: number; size: number } | null = null;
  let book: { start: number; size: number } | null = null;
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameLength = u16(dirView, at + 0x40);
    if (nameLength < 2) continue;
    let name = "";
    for (let i = 0; i < (nameLength - 2) / 2; i++) name += String.fromCharCode(u16(dirView, at + i * 2));
    const type = dir[at + 0x42];
    const entry = { start: u32(dirView, at + 0x74), size: u32(dirView, at + 0x78) };
    if (type === 5) root = entry;
    else if (type === 2 && (name === "Workbook" || name === "Book")) book = entry;
  }
  if (!book) throw new XlsReadError("No spreadsheet was found inside that file.");

  if (book.size >= miniCutoff) return readChain(data, fat, book.start, sectorSize, offsetOf, sectorLimit).subarray(0, book.size);

  // Small workbooks live in the "mini stream" with its own tiny allocation table.
  if (!root) throw new XlsReadError("The file is damaged.");
  const miniStream = readChain(data, fat, root.start, sectorSize, offsetOf, sectorLimit);
  const miniFatBytes = readChain(data, fat, firstMiniFat, sectorSize, offsetOf, sectorLimit);
  const miniFatView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  const miniFat = new Uint32Array(Math.min(miniFatSectors * (sectorSize / 4), miniFatBytes.length / 4));
  for (let i = 0; i < miniFat.length; i++) miniFat[i] = u32(miniFatView, i * 4);
  return readChain(miniStream, miniFat, book.start, miniSize, (s) => s * miniSize, sectorLimit * 8).subarray(0, book.size);
}

interface BiffRecord {
  id: number;
  start: number;
  end: number;
}

function records(stream: Uint8Array): BiffRecord[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const out: BiffRecord[] = [];
  for (let at = 0; at + 4 <= stream.length; ) {
    const id = u16(view, at);
    const length = u16(view, at + 2);
    if (at + 4 + length > stream.length) break;
    out.push({ id, start: at + 4, end: at + 4 + length });
    at += 4 + length;
  }
  return out;
}

/** The shared string table. Strings may run across CONTINUE records, which restart with a fresh encoding byte. */
function readSharedStrings(stream: Uint8Array, chunks: Array<{ start: number; end: number }>): string[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  let chunk = 0;
  let at = chunks[0].start;

  const roll = () => {
    while (chunk < chunks.length && at >= chunks[chunk].end) {
      chunk++;
      if (chunk < chunks.length) at = chunks[chunk].start;
    }
    return chunk < chunks.length;
  };
  const byte = () => {
    if (!roll()) throw new XlsReadError("The shared string table is cut short.");
    return stream[at++];
  };
  const word = () => byte() | (byte() << 8);
  const skip = (n: number) => {
    while (n > 0) {
      if (!roll()) return;
      const step = Math.min(n, chunks[chunk].end - at);
      at += step;
      n -= step;
    }
  };

  if (chunks[0].end - chunks[0].start < 8) return [];
  const unique = u32(view, chunks[0].start + 4);
  at = chunks[0].start + 8;
  const out: string[] = [];

  for (let n = 0; n < unique; n++) {
    if (!roll()) break;
    const cch = word();
    const flags = byte();
    let wide = (flags & 1) !== 0;
    const rich = (flags & 8) !== 0 ? word() : 0;
    const ext = (flags & 4) !== 0 ? byte() | (byte() << 8) | (byte() << 16) | (byte() << 24) : 0;

    let text = "";
    for (let i = 0; i < cch; i++) {
      if (at >= chunks[chunk].end) {
        // Crossing into a CONTINUE record in the middle of a string: its first byte restates the encoding.
        if (!roll()) break;
        wide = (stream[at++] & 1) !== 0;
      }
      if (wide) {
        text += String.fromCharCode(stream[at] | (stream[at + 1] << 8));
        at += 2;
      } else {
        text += String.fromCharCode(stream[at++]);
      }
    }
    skip(rich * 4 + ext);
    out.push(text);
  }
  return out;
}

function rkValue(rk: number): number {
  const div = (rk & 1) !== 0;
  let value: number;
  if ((rk & 2) !== 0) {
    value = rk >> 2;
  } else {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setUint32(4, (rk & 0xfffffffc) >>> 0, true);
    value = buffer.getFloat64(0, true);
  }
  return div ? value / 100 : value;
}

function numberText(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(10)));
}

/** Rows of the first worksheet, as text. Empty cells are empty strings. */
export function readXlsRows(bytes: Uint8Array): string[][] {
  const stream = workbookStream(bytes);
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const recs = records(stream);

  let strings: string[] = [];
  const cells = new Map<number, Map<number, string>>();
  const put = (row: number, col: number, value: string) => {
    let r = cells.get(row);
    if (!r) cells.set(row, (r = new Map()));
    r.set(col, value);
  };

  let sheetsSeen = 0;
  let inFirstSheet = false;
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    if (rec.id === 0x002f) throw new XlsReadError("This spreadsheet is password protected. Open it in Excel, save a copy without the password, and upload that.");

    if (rec.id === 0x0809) {
      const type = u16(view, rec.start + 2);
      if (type === 0x0010) {
        sheetsSeen++;
        inFirstSheet = sheetsSeen === 1;
      }
      continue;
    }
    if (rec.id === 0x000a && inFirstSheet) break;

    if (rec.id === 0x00fc) {
      const chunks = [{ start: rec.start, end: rec.end }];
      while (recs[i + 1]?.id === 0x003c) {
        i++;
        chunks.push({ start: recs[i].start, end: recs[i].end });
      }
      strings = readSharedStrings(stream, chunks);
      continue;
    }
    if (!inFirstSheet) continue;

    switch (rec.id) {
      case 0x00fd: // LABELSST
        put(u16(view, rec.start), u16(view, rec.start + 2), strings[u32(view, rec.start + 6)] ?? "");
        break;
      case 0x0203: // NUMBER
        put(u16(view, rec.start), u16(view, rec.start + 2), numberText(view.getFloat64(rec.start + 6, true)));
        break;
      case 0x027e: // RK
        put(u16(view, rec.start), u16(view, rec.start + 2), numberText(rkValue(u32(view, rec.start + 6))));
        break;
      case 0x00bd: {
        // MULRK: a run of RK numbers in one row.
        const row = u16(view, rec.start);
        const first = u16(view, rec.start + 2);
        const count = (rec.end - rec.start - 6) / 6;
        for (let k = 0; k < count; k++) put(row, first + k, numberText(rkValue(u32(view, rec.start + 4 + k * 6 + 2))));
        break;
      }
      case 0x0204: {
        // LABEL: an inline string (older writers).
        const length = u16(view, rec.start + 6);
        const wide = (stream[rec.start + 8] & 1) !== 0;
        let text = "";
        for (let k = 0; k < length; k++) {
          text += wide
            ? String.fromCharCode(u16(view, rec.start + 9 + k * 2))
            : String.fromCharCode(stream[rec.start + 9 + k]);
        }
        put(u16(view, rec.start), u16(view, rec.start + 2), text);
        break;
      }
      default:
        break;
    }
  }

  if (cells.size === 0) throw new XlsReadError("No cells were found in the first sheet of that file.");
  const lastRow = Math.max(...cells.keys());
  let lastCol = 0;
  for (const r of cells.values()) for (const c of r.keys()) lastCol = Math.max(lastCol, c);
  const rows: string[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    const row = cells.get(r);
    const out: string[] = [];
    for (let c = 0; c <= lastCol; c++) out.push(row?.get(c) ?? "");
    rows.push(out);
  }
  return rows;
}

/** The sheet as CSV text, ready for the statement parser. */
export function xlsToCsv(bytes: Uint8Array): string {
  return Papa.unparse(readXlsRows(bytes));
}
