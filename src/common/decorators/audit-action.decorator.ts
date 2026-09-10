import { SetMetadata } from "@nestjs/common";

export const AUDIT_ACTION_KEY = "auditAction";

/**
 * Usage: @AuditAction("submission.approved") on a mutating controller method.
 * Read by AuditLogInterceptor, which is applied globally (see AppModule) -
 * so tagging a route is the only thing a controller needs to do to get an
 * automatic audit trail entry.
 */
export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
