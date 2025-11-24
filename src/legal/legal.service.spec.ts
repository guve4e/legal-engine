import { Test, TestingModule } from '@nestjs/testing';
import { LegalService } from './legal.service';

describe('LegalService', () => {
  let service: LegalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LegalService],
    }).compile();

    service = module.get<LegalService>(LegalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
