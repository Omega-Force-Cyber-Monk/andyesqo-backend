import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { RepairRequestsController } from './repair-requests.controller.js';
import { RepairRequestsService } from './repair-requests.service.js';

@Module({
  imports: [VehiclesModule],
  controllers: [RepairRequestsController],
  providers: [RepairRequestsService],
  exports: [RepairRequestsService],
})
export class RepairRequestsModule {}
