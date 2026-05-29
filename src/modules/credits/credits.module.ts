import { Module } from '@nestjs/common';
import { CreditsRepository } from './credits.repository';
import { CreditsService } from './credits.service';

@Module({
  providers: [CreditsRepository, CreditsService],
  exports: [CreditsService, CreditsRepository],
})
export class CreditsModule {}
