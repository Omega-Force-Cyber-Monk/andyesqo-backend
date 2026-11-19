import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module.js';
import { UsersModule } from '../users/users.module.js';
import { BusinessesController } from './businesses.controller.js';
import { BusinessesService } from './businesses.service.js';
import { SetupReconcilerService } from './setup-reconciler.service.js';

@Module({
  imports: [UsersModule, RolesModule],
  controllers: [BusinessesController],
  providers: [BusinessesService, SetupReconcilerService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
