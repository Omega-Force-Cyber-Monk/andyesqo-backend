import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { RosterController } from './roster.controller.js';
import { RosterService } from './roster.service.js';
import { ShiftRemindersService } from './shift-reminders.service.js';

@Module({
  imports: [ComplianceModule],
  controllers: [RosterController],
  providers: [RosterService, ShiftRemindersService],
  exports: [RosterService],
})
export class RosterModule {}
