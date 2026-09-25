import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { FiltersService } from "@/modules/filters/filters.service";

// Bare `/filters` - the application-wide filter bar in the shell
// (m300-frontend's GlobalFilterBar), not scoped under any one module's own
// path the way every other `.../filters` endpoint is.
@ApiTags("filters")
@ApiBearerAuth()
@Controller("filters")
export class FiltersController {
  constructor(private readonly filters: FiltersService) {}

  @Get()
  getFilters() {
    return this.filters.getFilters();
  }
}
