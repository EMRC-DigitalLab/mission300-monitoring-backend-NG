import { Module } from "@nestjs/common";
import { SearchController } from "@/modules/search/search.controller";
import { SearchService } from "@/modules/search/search.service";

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
