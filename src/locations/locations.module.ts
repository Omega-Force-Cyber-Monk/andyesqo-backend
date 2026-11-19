import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller.js';
import { LocationRetentionService } from './location-retention.service.js';
import { LocationsService } from './locations.service.js';
import {
  RoutingProvider,
  UnconfiguredRoutingProvider,
} from './routing-provider.js';

@Module({
  controllers: [LocationsController],
  providers: [
    LocationsService,
    LocationRetentionService,
    { provide: RoutingProvider, useClass: UnconfiguredRoutingProvider },
  ],
})
export class LocationsModule {}
