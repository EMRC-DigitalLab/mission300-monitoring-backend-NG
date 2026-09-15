import { IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// Loosely matches m300-frontend/src/api/schemas/kpi-explorer.ts's
// setKpiCurrentValueRequestSchema, with two deliberate narrowings forced by
// this backend's own architecture (see KpiExplorerService.setCurrentValue()
// and toKpiProfile()'s "never stored, always derived" comment):
//
// - No `currentLabel` here: current/currentLabel are ALWAYS derived from
//   KpiValue.value + KpiDefinition.unit at read time, never stored as free
//   text - an admin override doesn't get to bypass that any more than an
//   approved submission does.
// - `resultingStatus` is confirmed/provisional only, not the full 5-value
//   vocabulary: validationStatus is derived from the Submission.status that
//   produced the KpiValue (deriveValidationStatus()), and APPROVE/
//   PROVISIONALLY_APPROVE are the only two decisions that have ever been
//   reachable in this system - "public-source"/"requires-validation" imply a
//   value sourced some other way this backend doesn't yet model.
export class SetKpiCurrentValueDto {
  @IsNumber()
  value!: number;

  @IsString()
  @MinLength(1, { message: "State the reporting period, e.g. Q4 2025" })
  reportingPeriod!: string;

  @IsIn(["confirmed", "provisional"], { message: "Select confirmed or provisional" })
  resultingStatus!: "confirmed" | "provisional";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
