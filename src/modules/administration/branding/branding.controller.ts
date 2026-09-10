import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BrandingService } from "@/modules/administration/branding/branding.service";
import { UpdateBrandingDto } from "@/modules/administration/branding/dto/update-branding.dto";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("administration/branding")
@Controller("administration/branding")
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  // Public: the public gateway and every logged-in view need this to theme the page.
  @Public()
  @Get()
  get() {
    return this.branding.get();
  }

  // Only the top admin role can restyle the site for everyone - see README.
  @ApiBearerAuth()
  @Roles("SYSTEM_ADMINISTRATOR")
  @Put()
  @AuditAction("branding.updated")
  update(@Body() dto: UpdateBrandingDto) {
    return this.branding.update(dto);
  }
}
