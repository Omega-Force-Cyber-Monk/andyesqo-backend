import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { InspectionsModule } from '../inspections/inspections.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { RosterModule } from '../roster/roster.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    ComplianceModule,
    DeliveriesModule,
    InspectionsModule,
    MaintenanceModule,
    RosterModule,
    VehiclesModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
