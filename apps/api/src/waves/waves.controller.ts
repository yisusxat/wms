import { Body, Controller, Get, Param, Post, Patch, Query } from '@nestjs/common';
import { WavesService, CreateOrderDto, CreateWaveDto } from './waves.service';

@Controller('waves')
export class WavesController {
  constructor(private readonly wavesService: WavesService) {}

  // ── Órdenes ──
  @Post('orders')
  createOrder(@Body() dto: CreateOrderDto) {
    return this.wavesService.createOrder(dto);
  }

  @Get('orders')
  findAllOrders(@Query('status') status?: string) {
    return this.wavesService.findAllOrders(status);
  }

  @Get('orders/:id')
  findOneOrder(@Param('id') id: string) {
    return this.wavesService.findOneOrder(id);
  }

  // ── Olas ──
  @Post()
  createWave(@Body() dto: CreateWaveDto) {
    return this.wavesService.createWave(dto);
  }

  @Get()
  findAllWaves() {
    return this.wavesService.findAllWaves();
  }

  @Patch(':id/close')
  closeWave(@Param('id') id: string) {
    return this.wavesService.closeWave(id);
  }

  @Patch('orders/lines/:lineId/picked')
  updatePickedQty(
    @Param('lineId') lineId: string,
    @Body('pickedQty') pickedQty: number,
  ) {
    return this.wavesService.updatePickedQty(lineId, pickedQty);
  }
}
