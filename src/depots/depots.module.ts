import { Module } from '@nestjs/common';
import { DepotsController } from './depots.controller.js';
import { DepotsService } from './depots.service.js';

@Module({ controllers: [DepotsController], providers: [DepotsService] })
export class DepotsModule {}
