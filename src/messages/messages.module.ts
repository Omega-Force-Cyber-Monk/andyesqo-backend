import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [DeliveriesModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
