import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { IssueStockDto } from './dto/issue-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { MovementsService } from './movements.service';
import { MovementsQueryDto } from './dto/movements-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Controller('movements')
@UseGuards(AuthGuard, RolesGuard)
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  findAll(@Query() query: MovementsQueryDto) {
    return this.movements.findAll(query);
  }

  @Post('entry')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  receive(@Body() body: ReceiveStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.movements.receive(body, user.id);
  }

  @Post('exit')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  issue(@Body() body: IssueStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.movements.issue(body, user.id);
  }

  @Post('transfer')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  transfer(@Body() body: TransferStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.movements.transfer(body, user.id);
  }

  @Post('adjustment')
  @Roles('ADMIN', 'SUPERVISOR')
  adjustment(@Body() body: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.movements.adjustment(body, user.id);
  }
}
