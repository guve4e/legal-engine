// src/documents/documents.controller.ts
import {
  Body,
  Controller,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';

@Controller('v1/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('generate')
  async generate(
    @Body()
    body: {
      procedureSlug: string;
      fields: Record<string, any>;
    },
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.generateForProcedure(
      body.procedureSlug,
      body.fields,
    );

    res
      .setHeader('Content-Type', doc.mimeType)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${doc.filename}"`,
      )
      .send(doc.buffer);
  }
}