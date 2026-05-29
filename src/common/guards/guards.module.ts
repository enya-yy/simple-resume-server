import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { AdminGuard } from './admin.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Global()
@Module({
  imports: [AuthModule],
  providers: [SessionAuthGuard, AdminGuard],
  exports: [SessionAuthGuard, AdminGuard, AuthModule],
})
export class GuardsModule {}
