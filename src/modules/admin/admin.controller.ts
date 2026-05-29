import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Query() query: Record<string, string | string[] | undefined>) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id')
  @UseGuards(CsrfGuard)
  patchUser(@Param('id') id: string, @Body() body: unknown) {
    return this.admin.patchUser(id, body);
  }

  @Get('users/:id/credits/ledger')
  listLedger(
    @Param('id') id: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.admin.listLedger(id, query);
  }

  @Post('users/:id/credits/adjust')
  @UseGuards(CsrfGuard)
  adjustCredits(@Param('id') id: string, @Body() body: unknown) {
    return this.admin.adjustCredits(id, body);
  }
}
