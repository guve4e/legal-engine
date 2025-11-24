import { Test, TestingModule } from '@nestjs/testing';
import { LegalController } from './legal.controller';

describe('LegalController', () => {
  let controller: LegalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalController],
    }).compile();

    controller = module.get<LegalController>(LegalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
