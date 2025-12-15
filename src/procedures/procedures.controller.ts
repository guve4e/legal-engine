// src/procedures/procedures.controller.ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { ProcedurePlannerService } from './procedure-planner.service';

@Controller('procedures')
export class ProceduresController {
  constructor(
    private readonly proceduresService: ProceduresService,
    private readonly procedurePlanner: ProcedurePlannerService,
  ) {}

  @Get()
  listAll() {
    return this.proceduresService.listAll();
  }

  @Post('plan')
  plan(@Body() body: { question: string }) {
    return this.procedurePlanner.planProcedureWithPg(body.question, {});
  }
}