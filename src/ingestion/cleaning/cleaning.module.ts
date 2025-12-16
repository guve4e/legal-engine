import { Module } from '@nestjs/common';
import { BulgarianNormCleaner } from './cleaners/bg-norm-cleaner';

export const CLEANER = Symbol('CLEANER');

@Module({
  providers: [
    {
      provide: CLEANER,
      useFactory: () =>
        new BulgarianNormCleaner({
          // defaults for now
        }),
    },
  ],
  exports: [CLEANER],
})
export class CleaningModule {}