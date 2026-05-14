import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { ResumesModule } from '../resumes/resumes.module';
import { SharesController } from './shares.controller';
import { SharesRepository } from './shares.repository';
import { SharesService } from './shares.service';

@Module({
  imports: [ResumesModule],
  controllers: [SharesController],
  providers: [SharesService, SharesRepository, CsrfService, CsrfGuard],
})
export class SharesModule {}
