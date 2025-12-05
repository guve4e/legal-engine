// legal/admin-laws.controller.ts
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Post,
} from '@nestjs/common';
import { AdminLawsService } from './admin-laws.service';
import {
  ListLawsQueryDto,
  LawListResponseDto,
  LawDetailDto,
  AdminLawsStatsDto,
} from '../legal/dto/admin-laws.dto';

@Controller('admin/laws')
export class AdminLawsController {
  constructor(private readonly service: AdminLawsService) {}

  @Get()
  list(@Query() query: ListLawsQueryDto): Promise<LawListResponseDto> {
    return this.service.listLaws(query);
  }

  @Get('stats') // <-- must be BEFORE :id
  stats(): Promise<AdminLawsStatsDto> {
    return this.service.getStats();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<LawDetailDto> {
    return this.service.getLawDetail(id);
  }

  @Post(':id/reingest')
  reingest(@Param('id', ParseIntPipe) id: number): Promise<{ status: string }> {
    return this.service.reingestLaw(id);
  }
}
