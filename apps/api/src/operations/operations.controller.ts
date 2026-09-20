import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { OperationsService } from "./operations.service";

@Controller("operations")
@UseGuards(AuthGuard, RolesGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("slotting/suggest/:productId")
  suggestSlotting(@Param("productId") productId: string) {
    return this.operations.suggestSlotting(productId);
  }

  @Post("picking/route")
  calculatePickingRoute(@Body() body: { items: { productId: string; quantity: number }[] }) {
    return this.operations.calculatePickingRoute(body.items ?? []);
  }

  @Get("labels/location/:locationId")
  getLocationLabel(@Param("locationId") locationId: string) {
    return this.operations.getLocationLabel(locationId);
  }

  @Get("labels/product/:productId")
  getProductLabel(@Param("productId") productId: string) {
    return this.operations.getProductLabel(productId);
  }
}
