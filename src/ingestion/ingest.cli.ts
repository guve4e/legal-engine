// src/ingestion/ingest.cli.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionService } from './ingestion.service';

function getArg(name: string): string | undefined {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  return hit ? hit.slice(key.length) : undefined;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const ingestion = app.get(IngestionService);

    const parsedDir =
      getArg('dir') ??
      getArg('parsedDir') ??
      process.env.LEX_LAWS_PARSED_DIR;

    const maxDocs = getArg('maxDocs') ? Number(getArg('maxDocs')) : undefined;

    const maxCharsPerChunk = getArg('maxCharsPerChunk')
      ? Number(getArg('maxCharsPerChunk'))
      : undefined;

    const model = getArg('model') ?? process.env.EMBEDDING_MODEL;

    // ✅ registry-driven ingestion
    await ingestion.ingestFromRegistry({
      parsedDir,
      maxDocs,
      maxCharsPerChunk,
      model,
    });

    await app.close();
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    await app.close();
    process.exit(1);
  }
}

main();