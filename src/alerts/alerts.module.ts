import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { AlertsService } from './alerts.service.js';

@Module({ imports: [ComplianceModule], providers: [AlertsService] })
export class AlertsModule {}
