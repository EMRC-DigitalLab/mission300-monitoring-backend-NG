import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "@/config/env.validation";
import { PrismaModule } from "@/prisma/prisma.module";
import { RabbitmqModule } from "@/events/rabbitmq.module";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { AuditLogInterceptor } from "@/common/interceptors/audit-log.interceptor";

import { AuthModule } from "@/modules/auth/auth.module";
import { HealthModule } from "@/modules/health/health.module";
import { InstitutionsModule } from "@/modules/institutions/institutions.module";
import { SubmissionsModule } from "@/modules/submissions/submissions.module";
import { KpisModule } from "@/modules/kpis/kpis.module";
import { ProgramsModule } from "@/modules/programs/programs.module";
import { BottlenecksModule } from "@/modules/bottlenecks/bottlenecks.module";
import { ReportsModule } from "@/modules/reports/reports.module";
import { StakeholdersModule } from "@/modules/stakeholders/stakeholders.module";
import { AdministrationModule } from "@/modules/administration/administration.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? "development"}`],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
      },
    }),
    PrismaModule,
    RabbitmqModule,

    AuthModule,
    HealthModule,
    InstitutionsModule,
    SubmissionsModule,
    KpisModule,
    ProgramsModule,
    BottlenecksModule,
    ReportsModule,
    StakeholdersModule,
    AdministrationModule,
  ],
  providers: [
    // Every route requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Then, if a route carries @Roles(...), the caller's role must match.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Auto-logs any route tagged @AuditAction(...) to audit_log_entries.
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
