import {
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '../generated/prisma/enums.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PaginationQueryDto, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import { NotificationModel } from '../common/swagger/entities.dto.js';
import {
  Marked,
  NotificationsDeleted,
} from '../common/swagger/responses.dto.js';

export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
  @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, q: NotificationQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const where = {
      userId: actor.id,
      type: q.type,
      ...(q.unreadOnly && { readAt: null }),
    };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId: actor.id, readAt: null },
      }),
    ]);
    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        unread,
      },
    };
  }

  async read(actor: AuthUser, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId: actor.id },
      data: { readAt: new Date() },
    });
    return { marked: res.count };
  }

  async readAll(actor: AuthUser) {
    const res = await this.prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: res.count };
  }

  async remove(actor: AuthUser, id: string) {
    const res = await this.prisma.notification.deleteMany({
      where: { id, userId: actor.id },
    });
    return { deleted: res.count };
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Alerts & Notifications (meta includes the unread count)',
  })
  @ApiPage(NotificationModel)
  list(@CurrentUser() user: AuthUser, @Query() q: NotificationQueryDto) {
    return this.notifications.list(user, q);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all read' })
  @ApiData(Marked)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.readAll(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiData(Marked)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.read(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiData(NotificationsDeleted)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.remove(user, id);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
