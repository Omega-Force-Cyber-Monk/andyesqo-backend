import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { InspectionsController } from './inspections.controller.js';
import { InspectionsService } from './inspections.service.js';

@Module({
  imports: [VehiclesModule],
  controllers: [InspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
