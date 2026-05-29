import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { CsrfService } from '../auth/csrf.service';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, CreditsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, CsrfService, CsrfGuard],
})
export class AdminModule {}
