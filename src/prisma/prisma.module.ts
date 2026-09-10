import { Global, Module } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

// Global so every feature module can inject PrismaService without importing
// PrismaModule everywhere - it is infrastructure, not a feature.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
