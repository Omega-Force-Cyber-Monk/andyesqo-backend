import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiQuery,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { SendMessageDto, ThreadQueryDto } from './dto/message.dto.js';
import { MessagesService } from './messages.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import { MessageModel } from '../common/swagger/entities.dto.js';
import {
  Conversation,
  Marked,
  Peer,
  Thread,
} from '../common/swagger/responses.dto.js';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  @RequirePermission(PermissionModule.COMMUNICATION, 'view')
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({
    summary: 'Conversation list with last message and unread count',
  })
  @ApiData([Conversation])
  conversations(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
  ) {
    return this.messages.conversations(user, search);
  }

  @Get('contacts')
  @RequirePermission(PermissionModule.COMMUNICATION, 'view')
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'People you can message' })
  @ApiData([Peer])
  contacts(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.messages.contacts(user, search);
  }

  @Get('with/:userId')
  @RequirePermission(PermissionModule.COMMUNICATION, 'view')
  @ApiOperation({ summary: 'Messages with one user (marks them read)' })
  @ApiData(Thread)
  thread(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() q: ThreadQueryDto,
  ) {
    return this.messages.thread(user, userId, q);
  }

  @Patch('with/:userId/read')
  @RequirePermission(PermissionModule.COMMUNICATION, 'view')
  @ApiOperation({ summary: 'Mark a conversation as read' })
  @ApiData(Marked)
  read(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.messages.markRead(user, userId);
  }

  @Post()
  @RequirePermission(PermissionModule.COMMUNICATION, 'edit')
  @ApiOperation({ summary: 'Send a message' })
  @ApiData(MessageModel, { status: 201 })
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.messages.send(user, dto);
  }
}
