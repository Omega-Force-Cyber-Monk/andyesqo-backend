import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';

@Module({
  imports: [DeliveriesModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
