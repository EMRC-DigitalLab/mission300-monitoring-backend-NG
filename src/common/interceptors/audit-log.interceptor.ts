import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { catchError, tap } from "rxjs/operators";
import { throwError, type Observable } from "rxjs";
import { AuditResult } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { AUDIT_ACTION_KEY } from "@/common/decorators/audit-action.decorator";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";

/**
 * Writes an AuditLogEntry for any mutating endpoint tagged with
 * @AuditAction - both when it succeeds and when it throws, since a genuine
 * failure (result: FAILURE in the frontend's audit contract - see
 * overview.mappers.ts's toAuditEventResponse) is itself something the real
 * audit trail needs to show, not just successful writes.
 *
 * "rejected" (a successful HTTP call that records a negative business
 * decision, e.g. a submission rejection) is derived per-action via
 * deriveResult() below, since the interceptor otherwise has no way to know
 * a 200 response represents a rejection rather than an approval.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(AUDIT_ACTION_KEY, context.getHandler());
    if (!action) return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser; params?: Record<string, string> }>();
    if (!request.user) return next.handle();
    const actorId = request.user.id;
    const fallbackEntityId = request.params?.id ?? "unknown";

    return next.handle().pipe(
      tap((result: unknown) => {
        const entity = result as { id?: string } | undefined;
        void this.prisma.auditLogEntry.create({
          data: {
            actorId,
            action,
            entityType: action.split(".")[0],
            entityId: entity?.id ?? fallbackEntityId,
            after: (result ?? undefined) as never,
            result: deriveResult(action, result),
          },
        });
      }),
      catchError((error: unknown) => {
        void this.prisma.auditLogEntry.create({
          data: {
            actorId,
            action,
            entityType: action.split(".")[0],
            entityId: fallbackEntityId,
            result: AuditResult.FAILURE,
          },
        });
        return throwError(() => error);
      }),
    );
  }
}

// Only submission.decision_recorded can currently produce "rejected" - its
// response is the updated Submission, whose `status` reflects the decision.
function deriveResult(action: string, result: unknown): AuditResult {
  if (action === "submission.decision_recorded") {
    const status = (result as { status?: string } | undefined)?.status;
    if (status === "REJECTED") return AuditResult.REJECTED;
  }
  return AuditResult.SUCCESS;
}
