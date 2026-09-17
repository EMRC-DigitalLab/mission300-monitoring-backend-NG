ALTER TABLE "users" ADD COLUMN "roles" "RoleName"[] NOT NULL DEFAULT ARRAY[]::"RoleName"[];
UPDATE "users" SET "roles" = ARRAY["role"]::"RoleName"[];
CREATE INDEX "users_roles_idx" ON "users" USING GIN ("roles");

CREATE TABLE "security_settings" (
  "id" TEXT NOT NULL,
  "allowSelfReview" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);
