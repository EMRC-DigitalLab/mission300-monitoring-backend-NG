import "reflect-metadata";
import { PrismaService } from "@/prisma/prisma.service";
import { StorageService } from "@/storage/storage.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";
import { SubmissionsService } from "@/modules/submissions/submissions.service";
import { FilesService } from "@/files/files.service";
import { assertInstitutionMembership, scopeInstitutionFilter } from "@/common/guards/institution-scope.guard";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";

const reviewer: AuthenticatedUser = {
  id: "reviewer-a",
  role: "DATA_REVIEWER",
  roles: ["DATA_REVIEWER"],
  institutionId: "institution-a",
};
const rabbit = { publish: jest.fn(async () => undefined) } as unknown as RabbitmqService;
const security = {
  get: jest.fn(async () => ({ allowSelfReview: false })),
} as unknown as SecuritySettingsService;

describe("Institution and file security audit (mock persistence)", () => {
  it("[F02 fixed] current review workflow rejects another institution's submission id", async () => {
    const decision = jest.fn(async () => ({}));
    const prisma = {
      submission: {
        findUnique: jest.fn(async () => ({
          id: "submission-b",
          institutionId: "institution-b",
          submittedById: "submitter-b",
          status: "PENDING",
          items: [],
          obligationId: null,
        })),
      },
      $transaction: jest.fn(async (work) =>
        work({
          submission: { updateMany: jest.fn(async () => ({ count: 1 })) },
          reviewDecision: { create: decision },
        }),
      ),
    };
    const service = new DataSubmissionsService(
      prisma as unknown as PrismaService,
      {} as StorageService,
      rabbit,
      security,
    );
    await expect(
      service.recordDecision(reviewer, "submission-b", { decision: "rejected", comments: "Audit fixture" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(decision).not.toHaveBeenCalled();
    expect(prisma.submission.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "submission-b", institutionId: "institution-a" } }),
    );
  });

  it("[F02 fixed] legacy review workflow rejects another institution's submission id", async () => {
    const decision = jest.fn(async () => ({}));
    const prisma = {
      submission: {
        findUnique: jest.fn(async () => ({
          id: "submission-b",
          institutionId: "institution-b",
          submittedById: "submitter-b",
          status: "UNDER_REVIEW",
          items: [],
        })),
      },
      $transaction: jest.fn(async (work) =>
        work({
          submission: { update: jest.fn(async () => ({})) },
          reviewDecision: { create: decision },
        }),
      ),
    };
    const service = new SubmissionsService(prisma as unknown as PrismaService, rabbit, security);
    await expect(
      service.recordDecision(reviewer, "submission-b", { decision: "REJECT", comment: "Audit fixture" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(decision).not.toHaveBeenCalled();
  });

  it("CONTROL rejects self-review in the current workflow", async () => {
    const transaction = jest.fn();
    const prisma = {
      submission: {
        findUnique: jest.fn(async () => ({
          submittedById: reviewer.id,
          status: "PENDING",
          institutionId: reviewer.institutionId,
        })),
      },
      $transaction: transaction,
    };
    const service = new DataSubmissionsService(
      prisma as unknown as PrismaService,
      {} as StorageService,
      rabbit,
      security,
    );
    await expect(
      service.recordDecision(reviewer, "self", { decision: "approved", comments: "Audit fixture" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("CONTROL scopes reviewer list queries and rejects foreign-institution submissions", () => {
    expect(scopeInstitutionFilter(reviewer)).toEqual({ institutionId: "institution-a" });
    expect(() => assertInstitutionMembership(reviewer, "institution-b")).toThrow();
    expect(scopeInstitutionFilter({ ...reviewer, institutionId: null })).toEqual({
      institutionId: "__none__",
    });
  });

  it("CONTROL rejects downloading another user's generic attachment", async () => {
    const prisma = { uploadedFile: { findUnique: jest.fn(async () => ({ uploadedById: "other-user" })) } };
    const service = new FilesService(prisma as unknown as PrismaService, {} as StorageService);
    await expect(service.findOne(reviewer, "file-b")).rejects.toMatchObject({ status: 403 });
  });

  it("[F10 fixed] forged file extension and MIME type are rejected before storage", async () => {
    const save = jest.fn(async () => ({
      key: "uploads/fixture.pdf",
      originalName: "fixture.pdf",
      mimeType: "application/pdf",
      size: 25,
    }));
    const prisma = { uploadedFile: { create: jest.fn(async () => ({ id: "file-a" })) } };
    const service = new FilesService(
      prisma as unknown as PrismaService,
      { save } as unknown as StorageService,
    );
    await expect(
      service.upload(reviewer, {
        originalname: "fixture.pdf",
        mimetype: "application/pdf",
        size: 25,
        buffer: Buffer.from("<script>fixture</script>"),
      } as Express.Multer.File),
    ).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
  });

  it("CONTROL rejects disallowed generic upload extensions", async () => {
    const save = jest.fn();
    const service = new FilesService({} as PrismaService, { save } as unknown as StorageService);
    await expect(
      service.upload(reviewer, {
        originalname: "fixture.exe",
        mimetype: "application/pdf",
      } as Express.Multer.File),
    ).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
  });
});
