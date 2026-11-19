import { Module } from '@nestjs/common';
import { RepairRequestsModule } from '../repair-requests/repair-requests.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { DamageReportsController } from './damage-reports.controller.js';
import { DamageReportsService } from './damage-reports.service.js';

@Module({
  imports: [VehiclesModule, RepairRequestsModule],
  controllers: [DamageReportsController],
  providers: [DamageReportsService],
})
export class DamageReportsModule {}
