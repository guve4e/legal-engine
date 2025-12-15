// src/admin/admin-procedures.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { ProcedureFactoryService } from '../procedures/procedure-factory.service';

@Controller('admin/procedure-drafts')
export class AdminProcedureDraftsController {
  constructor(
    private readonly factory: ProcedureFactoryService,
  ) {}

  @Post('generate')
  async generate(@Body() body: { scenario: string }) {
    // TODO: add auth guard here
    const result = await this.factory.generateDraftForScenario(body.scenario);

    return {
      draft: result.draft,
      rawContextPreview: result.rawContext.slice(0, 5),
      usedLawIds: result.usedLawIds,
    };
  }
}