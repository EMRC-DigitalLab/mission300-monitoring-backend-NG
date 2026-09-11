import { BadRequestException } from "@nestjs/common";

/**
 * The frontend's Zod enums (systemRoleSchema, accountStatusSchema,
 * permissionSchema, scopeLevelSchema - all in
 * m300-frontend/src/api/schemas/administration.ts) use lower-kebab-case
 * ("system-administrator", "distribution-company"). Prisma's generated
 * enums use SCREAMING_SNAKE_CASE ("SYSTEM_ADMINISTRATOR",
 * "DISTRIBUTION_COMPANY"). The mapping between the two is purely mechanical
 * (case + underscore/hyphen) for every enum in this module, so one pair of
 * generic converters replaces four hand-written lookup tables.
 */

export function toKebabCase(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

export function toScreamingSnakeCase(value: string): string {
  return value.toUpperCase().replace(/-/g, "_");
}

/**
 * Parses a kebab-case value from the frontend into one of `allowedValues`
 * (a Prisma enum's own value array), throwing a 400 with the offending
 * value named if it doesn't correspond to a known member - used at DTO/
 * query-param boundaries where class-validator's @IsEnum can't apply
 * because the wire format doesn't match the Prisma enum's own casing.
 */
export function parseKebabEnum<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fieldName: string,
): T {
  const candidate = toScreamingSnakeCase(value) as T;
  if (!allowedValues.includes(candidate)) {
    throw new BadRequestException(
      `${fieldName} must be one of: ${allowedValues.map(toKebabCase).join(", ")}`,
    );
  }
  return candidate;
}
