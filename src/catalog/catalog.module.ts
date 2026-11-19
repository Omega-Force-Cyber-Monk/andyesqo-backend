import { Module } from '@nestjs/common';
import {
  DamageTypesController,
  IncidentTypesController,
} from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  controllers: [DamageTypesController, IncidentTypesController],
  providers: [CatalogService],
})
export class CatalogModule {}
