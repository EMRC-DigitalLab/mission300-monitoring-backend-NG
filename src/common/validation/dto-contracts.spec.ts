import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { ClassConstructor } from "class-transformer";
import { IdentifyDto } from "@/modules/auth/dto/identify.dto";
import { LoginDto } from "@/modules/auth/dto/login.dto";
import { CreateProgrammeDto } from "@/modules/programs/dto/create-programme.dto";
import { ProgramsQueryDto } from "@/modules/programs/dto/programs-query.dto";

type ValidationCase = {
  name: string;
  dto: ClassConstructor<object>;
  payload: Record<string, unknown>;
  valid: boolean;
};

function isValid(dto: ClassConstructor<object>, payload: Record<string, unknown>): boolean {
  try {
    return validateSync(plainToInstance(dto, payload), { forbidUnknownValues: false }).length === 0;
  } catch {
    return false;
  }
}

const baseProgramme = {
  name: "National Grid Expansion",
  leadInstitution: "Federal Ministry of Power",
  pillar: "generation-network",
  objectives: "Expand reliable national grid capacity.",
  status: "on-track",
  endDate: "2030-12-31",
};

const cases: ValidationCase[] = [
  // ProgramsQueryDto: 20 boundary and transformation cases.
  { name: "query accepts an empty payload", dto: ProgramsQueryDto, payload: {}, valid: true },
  { name: "query accepts page 1", dto: ProgramsQueryDto, payload: { page: 1 }, valid: true },
  { name: "query transforms page from a string", dto: ProgramsQueryDto, payload: { page: "2" }, valid: true },
  { name: "query accepts pageSize 1", dto: ProgramsQueryDto, payload: { pageSize: 1 }, valid: true },
  { name: "query accepts pageSize 200", dto: ProgramsQueryDto, payload: { pageSize: 200 }, valid: true },
  {
    name: "query transforms pageSize from a string",
    dto: ProgramsQueryDto,
    payload: { pageSize: "25" },
    valid: true,
  },
  { name: "query accepts search", dto: ProgramsQueryDto, payload: { search: "grid" }, valid: true },
  {
    name: "query accepts pillar",
    dto: ProgramsQueryDto,
    payload: { pillar: "generation-network" },
    valid: true,
  },
  { name: "query accepts institution", dto: ProgramsQueryDto, payload: { institution: "REA" }, valid: true },
  { name: "query accepts status", dto: ProgramsQueryDto, payload: { status: "on-track" }, valid: true },
  { name: "query rejects page zero", dto: ProgramsQueryDto, payload: { page: 0 }, valid: false },
  { name: "query rejects a negative page", dto: ProgramsQueryDto, payload: { page: -1 }, valid: false },
  { name: "query rejects a zero page string", dto: ProgramsQueryDto, payload: { page: "0" }, valid: false },
  {
    name: "query rejects a nonnumeric page",
    dto: ProgramsQueryDto,
    payload: { page: "first" },
    valid: false,
  },
  { name: "query rejects a fractional page", dto: ProgramsQueryDto, payload: { page: 1.5 }, valid: false },
  { name: "query rejects pageSize zero", dto: ProgramsQueryDto, payload: { pageSize: 0 }, valid: false },
  {
    name: "query rejects pageSize above 200",
    dto: ProgramsQueryDto,
    payload: { pageSize: 201 },
    valid: false,
  },
  {
    name: "query rejects an oversized pageSize string",
    dto: ProgramsQueryDto,
    payload: { pageSize: "201" },
    valid: false,
  },
  {
    name: "query rejects a nonnumeric pageSize",
    dto: ProgramsQueryDto,
    payload: { pageSize: "many" },
    valid: false,
  },
  {
    name: "query rejects a fractional pageSize",
    dto: ProgramsQueryDto,
    payload: { pageSize: 2.5 },
    valid: false,
  },

  // LoginDto: 20 credential-shape cases.
  {
    name: "login accepts a normal address",
    dto: LoginDto,
    payload: { email: "admin@example.com", password: "password1" },
    valid: true,
  },
  {
    name: "login accepts a subdomain",
    dto: LoginDto,
    payload: { email: "user@api.example.com", password: "12345678" },
    valid: true,
  },
  {
    name: "login accepts plus addressing",
    dto: LoginDto,
    payload: { email: "user+qa@example.org", password: "long-password" },
    valid: true,
  },
  {
    name: "login accepts a long TLD",
    dto: LoginDto,
    payload: { email: "user@example.technology", password: "abcdefgh" },
    valid: true,
  },
  {
    name: "login accepts a mixed-case address",
    dto: LoginDto,
    payload: { email: "Admin@Example.COM", password: "abcdefgh" },
    valid: true,
  },
  { name: "login rejects an empty payload", dto: LoginDto, payload: {}, valid: false },
  { name: "login rejects a missing email", dto: LoginDto, payload: { password: "password1" }, valid: false },
  {
    name: "login rejects a missing password",
    dto: LoginDto,
    payload: { email: "admin@example.com" },
    valid: false,
  },
  {
    name: "login rejects an empty email",
    dto: LoginDto,
    payload: { email: "", password: "password1" },
    valid: false,
  },
  {
    name: "login rejects an empty password",
    dto: LoginDto,
    payload: { email: "admin@example.com", password: "" },
    valid: false,
  },
  {
    name: "login rejects a seven-character password",
    dto: LoginDto,
    payload: { email: "admin@example.com", password: "1234567" },
    valid: false,
  },
  {
    name: "login rejects a numeric password",
    dto: LoginDto,
    payload: { email: "admin@example.com", password: 12345678 },
    valid: false,
  },
  {
    name: "login rejects an email without at-sign",
    dto: LoginDto,
    payload: { email: "example.com", password: "password1" },
    valid: false,
  },
  {
    name: "login rejects an email without domain",
    dto: LoginDto,
    payload: { email: "user@", password: "password1" },
    valid: false,
  },
  {
    name: "login rejects an email without local part",
    dto: LoginDto,
    payload: { email: "@example.com", password: "password1" },
    valid: false,
  },
  {
    name: "login rejects spaces in email",
    dto: LoginDto,
    payload: { email: "user @example.com", password: "password1" },
    valid: false,
  },
  {
    name: "login rejects a boolean email",
    dto: LoginDto,
    payload: { email: true, password: "password1" },
    valid: false,
  },
  {
    name: "login rejects a null email",
    dto: LoginDto,
    payload: { email: null, password: "password1" },
    valid: false,
  },
  {
    name: "login rejects a null password",
    dto: LoginDto,
    payload: { email: "admin@example.com", password: null },
    valid: false,
  },
  {
    name: "login rejects an array password",
    dto: LoginDto,
    payload: { email: "admin@example.com", password: ["password1"] },
    valid: false,
  },

  // IdentifyDto: 15 email-contract cases.
  {
    name: "identify accepts a normal address",
    dto: IdentifyDto,
    payload: { email: "user@example.com" },
    valid: true,
  },
  {
    name: "identify accepts plus addressing",
    dto: IdentifyDto,
    payload: { email: "user+tag@example.com" },
    valid: true,
  },
  {
    name: "identify accepts a subdomain",
    dto: IdentifyDto,
    payload: { email: "user@mail.example.com" },
    valid: true,
  },
  {
    name: "identify accepts a country TLD",
    dto: IdentifyDto,
    payload: { email: "user@example.com.ng" },
    valid: true,
  },
  {
    name: "identify accepts mixed case",
    dto: IdentifyDto,
    payload: { email: "User@Example.COM" },
    valid: true,
  },
  { name: "identify rejects missing email", dto: IdentifyDto, payload: {}, valid: false },
  { name: "identify rejects empty email", dto: IdentifyDto, payload: { email: "" }, valid: false },
  { name: "identify rejects plain text", dto: IdentifyDto, payload: { email: "not-an-email" }, valid: false },
  {
    name: "identify rejects missing local part",
    dto: IdentifyDto,
    payload: { email: "@example.com" },
    valid: false,
  },
  { name: "identify rejects missing domain", dto: IdentifyDto, payload: { email: "user@" }, valid: false },
  {
    name: "identify rejects whitespace",
    dto: IdentifyDto,
    payload: { email: "user @example.com" },
    valid: false,
  },
  { name: "identify rejects a number", dto: IdentifyDto, payload: { email: 42 }, valid: false },
  { name: "identify rejects a boolean", dto: IdentifyDto, payload: { email: false }, valid: false },
  { name: "identify rejects null", dto: IdentifyDto, payload: { email: null }, valid: false },
  {
    name: "identify rejects an array",
    dto: IdentifyDto,
    payload: { email: ["user@example.com"] },
    valid: false,
  },

  // CreateProgrammeDto: 15 complete request-contract cases.
  {
    name: "programme accepts the base payload",
    dto: CreateProgrammeDto,
    payload: baseProgramme,
    valid: true,
  },
  {
    name: "programme accepts an optional financing note",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, financing: "World Bank facility" },
    valid: true,
  },
  {
    name: "programme accepts delayed status",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, status: "delayed" },
    valid: true,
  },
  {
    name: "programme accepts clean-cooking pillar",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, pillar: "clean-cooking" },
    valid: true,
  },
  {
    name: "programme accepts an ISO timestamp",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, endDate: "2030-12-31T00:00:00.000Z" },
    valid: true,
  },
  { name: "programme rejects missing fields", dto: CreateProgrammeDto, payload: {}, valid: false },
  {
    name: "programme rejects a short name",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, name: "NG" },
    valid: false,
  },
  {
    name: "programme rejects an empty institution",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, leadInstitution: "" },
    valid: false,
  },
  {
    name: "programme rejects an unknown pillar",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, pillar: "unknown" },
    valid: false,
  },
  {
    name: "programme rejects short objectives",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, objectives: "Too short" },
    valid: false,
  },
  {
    name: "programme rejects an unknown status",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, status: "unknown" },
    valid: false,
  },
  {
    name: "programme rejects a malformed date",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, endDate: "next year" },
    valid: false,
  },
  {
    name: "programme rejects a numeric name",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, name: 12345 },
    valid: false,
  },
  {
    name: "programme rejects numeric financing",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, financing: 5000 },
    valid: false,
  },
  {
    name: "programme rejects financing above 200 characters",
    dto: CreateProgrammeDto,
    payload: { ...baseProgramme, financing: "x".repeat(201) },
    valid: false,
  },
];

describe("DTO validation contracts", () => {
  it("contains the intended validation matrix", () => {
    expect(cases).toHaveLength(70);
  });

  it.each(cases)("$name", ({ dto, payload, valid }) => {
    expect(isValid(dto, payload)).toBe(valid);
  });
});
