import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { tap } from "rxjs/operators";
import type { Observable } from "rxjs";
import { PrismaService } from "@/prisma/prisma.service";
import { AUDIT_ACTION_KEY } from "@/common/decorators/audit-action.decorator";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";

/**
 * Writes an AuditLogEntry after any mutating endpoint tagged with
 * @AuditAction succeeds. This keeps audit logging out of every individual
 * service method - one interceptor, applied globally, catches every tagged
 * write. Failed requests are not logged here (nothing happened to record).
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

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    return next.handle().pipe(
      tap((result: unknown) => {
        if (!request.user) return;
        const entity = result as { id?: string } | undefined;

        void this.prisma.auditLogEntry.create({
          data: {
            actorId: request.user.id,
            action,
            entityType: action.split(".")[0],
            entityId: entity?.id ?? "unknown",
            after: (result ?? undefined) as never,
          },
        });
      }),
    );
  }
}
