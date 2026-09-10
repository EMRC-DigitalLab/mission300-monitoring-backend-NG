import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// Usage: @Public() on login, health check, or other routes that must work
// without a bearer token. JwtAuthGuard checks for this metadata and skips
// authentication when present.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
