import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { MaintenanceController } from './maintenance.controller.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [VehiclesModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
