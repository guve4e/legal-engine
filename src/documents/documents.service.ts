import { Injectable } from '@nestjs/common';
import { ProceduresService } from '../procedures/procedures.service';
// import your docx templating lib here later

export interface GeneratedDocument {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly proceduresService: ProceduresService) {}

  /**
   * For MVP: load a .docx file from disk with {{placeholders}}
   * and replace them with fields.
   */
  async generateForProcedure(
    procedureSlug: string,
    fields: Record<string, any>,
  ): Promise<GeneratedDocument> {
    const procedure = this.proceduresService.getBySlug(procedureSlug);
    if (!procedure) {
      throw new Error(`Unknown procedure slug: ${procedureSlug}`);
    }

    const templateCode = procedure.templateCode;

    // TODO: map templateCode → file path
    const templatePath = `/opt/aiadvocate/templates/${templateCode}.docx`;

    // TODO: implement docx templating with docxtemplater or similar:
    // 1) read file
    // 2) replace placeholders
    // 3) return buffer

    const buffer = Buffer.from('NOT_IMPLEMENTED'); // placeholder

    const filename = `${procedure.slug}-${Date.now()}.docx`;

    return {
      buffer,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
}