import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { SearchService } from "@/modules/search/search.service";
import { SearchQueryDto } from "@/modules/search/dto/search-query.dto";

// Bare `/search` - backs the topbar's global search box
// (m300-frontend's TopbarSearch), not scoped under any one module.
@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  getResults(@Query() query: SearchQueryDto) {
    return this.search.search(query.q);
  }
}
