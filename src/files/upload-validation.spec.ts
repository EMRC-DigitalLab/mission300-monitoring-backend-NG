import JSZip from "jszip";
import { validateUpload } from "./upload-validation";
import { FilesService } from "./files.service";
import { BrandingService } from "@/modules/administration/branding/branding.service";
import type { PrismaService } from "@/prisma/prisma.service";
import type { StorageService } from "@/storage/storage.service";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=",
  "base64",
);
const file = (originalname: string, mimetype: string, buffer: Buffer) =>
  ({ originalname, mimetype, buffer, size: 1 }) as Express.Multer.File;
async function office(extension = "docx", extra = false) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<Types><Override ContentType="application/vnd.openxmlformats-officedocument.${extension === "docx" ? "wordprocessingml.document" : "spreadsheetml.sheet"}.main+xml" /></Types>`,
  );
  zip.file(
    extension === "docx" ? "word/document.xml" : "xl/workbook.xml",
    extension === "docx"
      ? '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body /></w:document>'
      : '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" />',
  );
  if (extra) zip.file("word/vbaProject.bin", "active macro");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
describe("Evidence and logo upload validation", () => {
  it.each([
    ["image.png", "image/png"],
    ["image.jpg", "image/jpeg"],
    ["image.gif", "image/gif"],
    ["image.webp", "image/webp"],
    ["document.pdf", "application/pdf"],
    ["document.doc", "application/msword"],
    ["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["table.xls", "application/vnd.ms-excel"],
    ["table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["table.csv", "text/csv"],
  ])("rejects forged content declared as %s", async (name, mime) => {
    await expect(
      validateUpload(file(name!, mime!, Buffer.from("<script>alert(1)</script>"))),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("accepts a PNG and uses the actual byte count", async () => {
    await expect(validateUpload(file("logo.png", "image/png", png), true)).resolves.toMatchObject({
      mimetype: "image/png",
      size: png.length,
    });
  });
  it("accepts a PDF format signature and terminator", async () => {
    await expect(
      validateUpload(
        file(
          "evidence.pdf",
          "application/pdf",
          Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"),
        ),
      ),
    ).resolves.toHaveProperty("mimetype", "application/pdf");
  });
  it.each(["docx", "xlsx"])("accepts a matching %s container", async (extension) => {
    const mime =
      extension === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    await expect(
      validateUpload(file(`evidence.${extension}`, mime, await office(extension))),
    ).resolves.toHaveProperty("mimetype", mime);
  });
  it.each(["doc", "xls"])("rejects legacy %s containers before invoking any parser", async (extension) => {
    const buffer = Buffer.alloc(512);
    Buffer.from("d0cf11e0a1b11ae1", "hex").copy(buffer);
    const mime = extension === "doc" ? "application/msword" : "application/vnd.ms-excel";
    await expect(validateUpload(file(`evidence.${extension}`, mime, buffer))).rejects.toMatchObject({
      status: 400,
    });
  });
  it("rejects archive type mismatches, macros and zip bombs", async () => {
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    await expect(validateUpload(file("evidence.docx", mime, await office("xlsx")))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      validateUpload(file("evidence.docx", mime, await office("docx", true))),
    ).rejects.toMatchObject({ status: 400 });
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "a".repeat(1024 * 1024));
    await expect(
      validateUpload(
        file("bomb.docx", mime, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("accepts quoted CSV rows and rejects binary, HTML, formulas and malformed rows", async () => {
    await expect(
      validateUpload(file("table.csv", "text/csv", Buffer.from('name,value\r\n"quoted,name",12\r\n'))),
    ).resolves.toHaveProperty("mimetype", "text/csv");
    for (const text of [
      'name,value\nA,=HYPERLINK("evil")',
      "name,value\nA,@SUM(1)",
      "name,value\nA,+cmd",
      "name,value\nA,\x00",
      'name,value\n"unclosed,12',
      "name,value\nA,1,extra",
      "name,value\n<script>,1",
    ]) {
      await expect(validateUpload(file("table.csv", "text/csv", Buffer.from(text)))).rejects.toMatchObject({
        status: 400,
      });
    }
  });
  it("rejects missing files, MIME/extension mismatches, unsafe filenames and byte-size bypasses", async () => {
    await expect(validateUpload(undefined)).rejects.toMatchObject({ status: 400 });
    await expect(validateUpload(file("logo.png", "application/pdf", png))).rejects.toMatchObject({
      status: 400,
    });
    await expect(validateUpload(file("../logo.png", "image/png", png))).rejects.toMatchObject({
      status: 400,
    });
    await expect(validateUpload(file('logo".png', "image/png", png))).rejects.toMatchObject({ status: 400 });
    await expect(validateUpload(file("logo.png", "image/png", png), true, 10)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("blocks spoofed generic evidence before storage or persistence", async () => {
    const save = jest.fn(),
      create = jest.fn();
    const service = new FilesService(
      { uploadedFile: { create } } as unknown as PrismaService,
      { save } as unknown as StorageService,
    );
    await expect(
      service.upload(
        { id: "reader", role: "READ_ONLY_USER", institutionId: null },
        file("evidence.pdf", "application/pdf", Buffer.from("HTML")),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects executable SVG logos, including historical public logo files", async () => {
    const save = jest.fn(),
      read = jest.fn().mockResolvedValue(Buffer.from('<svg onload="alert(1)"/>'));
    const service = new BrandingService({} as PrismaService, { save, read } as unknown as StorageService);
    await expect(
      service.uploadLogo(file("logo.svg", "image/svg+xml", Buffer.from("<svg/>"))),
    ).rejects.toMatchObject({ status: 400 });
    await expect(service.readLogo("old.svg")).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
  });
});
