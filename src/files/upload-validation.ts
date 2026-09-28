import { BadRequestException } from "@nestjs/common";
import { extname } from "node:path";
import { TextDecoder } from "node:util";
import type { Readable } from "node:stream";
import JSZip from "jszip";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
};
function invalid(): never {
  throw new BadRequestException(
    "Upload a valid PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX or CSV file. Legacy DOC/XLS and SVG are not supported.",
  );
}

function containsControls(value: string, allowTextWhitespace = false): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 32 && !(allowTextWhitespace && [9, 10, 13].includes(code))) || code === 127) return true;
  }
  return false;
}

/** Validate bytes before storage, including the extension/MIME pairing.
 * These are format checks, not a malware scanner or document sanitizer.
 */
export async function validateUpload(
  file: Express.Multer.File | undefined,
  imagesOnly = false,
  maxBytes = 20 * 1024 * 1024,
): Promise<Express.Multer.File> {
  if (!file || typeof file.originalname !== "string" || !Buffer.isBuffer(file.buffer)) invalid();
  if (
    !file.buffer.length ||
    file.buffer.length > maxBytes ||
    Buffer.byteLength(file.originalname) > 255 ||
    /[<>:"/\\|?*]/.test(file.originalname) ||
    containsControls(file.originalname)
  )
    invalid();
  const ext = extname(file.originalname).toLowerCase();
  const mime = MIME[ext];
  if (!mime || file.mimetype !== mime || (imagesOnly && !mime.startsWith("image/"))) invalid();
  const data = file.buffer;
  try {
    let valid = false;
    switch (ext) {
      case ".png":
        valid =
          data.length >= 45 &&
          data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
          data.readUInt32BE(8) === 13 &&
          data.toString("ascii", 12, 16) === "IHDR" &&
          data.readUInt32BE(16) > 0 &&
          data.readUInt32BE(20) > 0 &&
          data.subarray(-12).equals(Buffer.from("0000000049454e44ae426082", "hex"));
        break;
      case ".jpg":
      case ".jpeg":
        valid =
          data.length > 4 &&
          data.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) &&
          data.subarray(-2).equals(Buffer.from("ffd9", "hex"));
        break;
      case ".gif":
        valid =
          data.length >= 14 &&
          /^GIF8[79]a$/.test(data.toString("ascii", 0, 6)) &&
          data.readUInt16LE(6) > 0 &&
          data.readUInt16LE(8) > 0 &&
          data[data.length - 1] === 0x3b;
        break;
      case ".webp":
        valid =
          data.length >= 20 &&
          data.toString("ascii", 0, 4) === "RIFF" &&
          data.readUInt32LE(4) + 8 === data.length &&
          data.toString("ascii", 8, 12) === "WEBP" &&
          ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16));
        break;
      case ".pdf":
        valid =
          /^%PDF-[12]\.\d/.test(data.toString("ascii", 0, 8)) &&
          /%%EOF\s*$/.test(data.subarray(-1024).toString("latin1"));
        break;
      case ".csv":
        valid = validCsv(data);
        break;
      case ".docx":
      case ".xlsx":
        valid = await validOfficeZip(data, ext);
        break;
    }
    if (!valid) invalid();
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    invalid();
  }
  return { ...file, mimetype: mime, size: data.length };
}

function validCsv(data: Buffer): boolean {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF/, "");
  if (
    containsControls(text, true) ||
    /<\s*(?:!doctype|html|script|svg|iframe|object|embed|body)\b/i.test(text)
  )
    return false;
  const delimiter = [",", ";", "\t"].find((candidate) => text.split(/\r?\n/, 1)[0]!.includes(candidate));
  if (!delimiter) return false;
  let quoted = false,
    closed = false,
    field = "",
    columns = 1,
    expected = 0,
    rows = 0;
  const finishField = () => {
    if (/^\s*(?:=|@|[+-](?!\d))/.test(field)) invalid();
    field = "";
    closed = false;
  };
  const finishRow = () => {
    const empty = columns === 1 && !field && !closed;
    finishField();
    if (!empty && (columns > 1 || expected)) {
      if (expected && columns !== expected) invalid();
      expected = columns;
      if (++rows > 100000) invalid();
    }
    columns = 1;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === '"') {
      if (field || closed) return false;
      quoted = true;
    } else if (char === delimiter) {
      finishField();
      columns++;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      finishRow();
    } else {
      if (closed) return false;
      field += char;
    }
    if (field.length > 65536 || columns > 1000) return false;
  }
  if (quoted) return false;
  if (field || closed || columns > 1) finishRow();
  return rows > 0;
}

/** Inspect ZIP central directory sizes before any entry is decompressed.
 * ZIP64, encryption and oversized/over-compressed containers fail closed.
 */
function checkZipBudget(data: Buffer): boolean {
  let end = -1;
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset--) {
    if (
      data.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + data.readUInt16LE(offset + 20) === data.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) return false;
  const count = data.readUInt16LE(end + 10),
    size = data.readUInt32LE(end + 12);
  let offset = data.readUInt32LE(end + 16),
    total = 0;
  const start = offset;
  if (!count || count > 1000 || offset + size !== end || data.readUInt16LE(end + 8) !== count) return false;
  for (let entry = 0; entry < count; entry++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50 || data.readUInt16LE(offset + 8) & 1)
      return false;
    const method = data.readUInt16LE(offset + 10),
      compressed = data.readUInt32LE(offset + 20),
      expanded = data.readUInt32LE(offset + 24);
    total += expanded;
    if (
      ![0, 8].includes(method) ||
      expanded > 10 * 1024 * 1024 ||
      total > 50 * 1024 * 1024 ||
      expanded > Math.max(compressed, 1) * 100
    )
      return false;
    const nameLength = data.readUInt16LE(offset + 28);
    if (offset + 46 + nameLength > end) return false;
    const name = data.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (/^\/|\\|(^|\/)\.\.(\/|$)|:/.test(name) || containsControls(name)) return false;
    offset +=
      46 + data.readUInt16LE(offset + 28) + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
  }
  return offset === start + size;
}

async function validOfficeZip(data: Buffer, extension: string): Promise<boolean> {
  if (!checkZipBudget(data)) return false;
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);
  if (
    names.some((name) => /(^\/|\\|(^|\/)\.\.(\/|$)|vbaProject\.bin|\/activeX\/|\/embeddings\/)/i.test(name))
  )
    return false;
  const contentTypes = zip.file("[Content_Types].xml");
  const document = zip.file(extension === ".docx" ? "word/document.xml" : "xl/workbook.xml");
  if (!contentTypes || !document) return false;
  // Count actual inflated bytes as well: directory metadata can be forged.
  let total = 0,
    types = "",
    body = "";
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const stream = entry.nodeStream("nodebuffer") as unknown as Readable;
    const chunks: Buffer[] = [];
    let size = 0;
    await new Promise<void>((resolve, reject) => {
      let stopped = false;
      stream.on("data", (chunk: Buffer) => {
        if (stopped) return;
        size += chunk.length;
        total += chunk.length;
        if (
          size > 10 * 1024 * 1024 ||
          total > 50 * 1024 * 1024 ||
          (entry === contentTypes && size > 1024 * 1024)
        ) {
          stopped = true;
          stream.destroy();
          reject(new BadRequestException("Document decompression exceeds the upload limit."));
          return;
        }
        if (entry === contentTypes || entry === document) chunks.push(chunk);
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    if (entry === contentTypes) types = Buffer.concat(chunks).toString("utf8");
    if (entry === document) body = Buffer.concat(chunks).toString("utf8");
  }
  if (/<!DOCTYPE|<!ENTITY|macroEnabled/i.test(types + body)) return false;
  const type = extension === ".docx" ? "wordprocessingml.document.main+xml" : "spreadsheetml.sheet.main+xml";
  return (
    types.includes(`application/vnd.openxmlformats-officedocument.${type}`) &&
    (extension === ".docx" ? /<(?:\w+:)?document(?:\s|>)/ : /<(?:\w+:)?workbook(?:\s|>)/).test(body)
  );
}
