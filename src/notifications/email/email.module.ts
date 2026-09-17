import { Global, Module } from "@nestjs/common";
import { EmailService } from "@/notifications/email/email.service";

// Global, same as PrismaModule/RabbitmqModule/StorageModule - EmailService
// has no dependency on anything webhook/consumer-specific, so it lives on
// its own rather than nested inside NotificationsModule. That matters
// concretely: AuthService needs EmailService (for forgot-password), and
// NotificationsConsumer needs AuthService (for the invite-email token) -
// nesting EmailService inside NotificationsModule would make that a
// circular module dependency (AuthModule <-> NotificationsModule).
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
