import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdministratorsController } from './administrators.controller.js';
import { AdministratorsService } from './administrators.service.js';

@Module({
  imports: [UsersModule, BusinessesModule],
  controllers: [AdministratorsController],
  providers: [AdministratorsService],
})
export class AdministratorsModule {}
