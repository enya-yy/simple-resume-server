import { Global, Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CreditsModule } from '../credits/credits.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { UsersRepository } from './users.repository';

@Global()
@Module({
  imports: [CreditsModule],
  controllers: [AuthController],
  providers: [AuthService, UsersRepository, CsrfService, CsrfGuard],
  exports: [UsersRepository],
})
export class AuthModule {}
