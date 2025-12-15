import { Module, forwardRef } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { ProceduresController } from './procedures.controller';
import { ProcedureFactoryService } from './procedure-factory.service';
import { ProcedurePlannerService } from './procedure-planner.service';

import { LegalModule } from '../legal/legal.module';
import { AiModule } from '../ai/ai.module';
import { PgModule } from '../pg/pg.module';

@Module({
  imports: [
    forwardRef(() => LegalModule),
    AiModule,
    PgModule,
  ],
  providers: [
    ProceduresService,
    ProcedureFactoryService,
    ProcedurePlannerService,
  ],
  controllers: [ProceduresController],
  exports: [
    ProceduresService,
    ProcedureFactoryService,
    ProcedurePlannerService,
  ],
})
export class ProceduresModule {}