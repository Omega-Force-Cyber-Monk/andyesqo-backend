import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import { NotifyService } from '../common/notify/notify.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SendMessageDto, ThreadQueryDto } from './dto/message.dto.js';

const peerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  employeeId: true,
  avatarUrl: true,
  assignedVehicles: { select: { registration: true }, take: 1 },
} as const;

/** One-to-one chat between users of the same business (dispatch ↔ drivers). */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly deliveries: DeliveriesService,
  ) {}

  private async assertPeer(actor: AuthUser, peerId: string) {
    if (peerId === actor.id)
      throw new BadRequestException('Cannot message yourself');
    const peer = await this.prisma.user.findUnique({
      where: { id: peerId },
      select: { ...peerSelect, businessId: true, status: true },
    });
    if (!peer) throw new NotFoundException('User not found');
    const sameBusiness = peer.businessId === actor.businessId;
    const platform =
      actor.role === UserRole.SUPER_ADMIN || peer.role === UserRole.SUPER_ADMIN;
    if (!sameBusiness && !platform)
      throw new NotFoundException('User not found');
    return peer;
  }

  /** People you can start a chat with ("Search users..."). */
  contacts(actor: AuthUser, search?: string) {
    return this.prisma.user.findMany({
      where: {
        businessId: actor.businessId ?? undefined,
        id: { not: actor.id },
        status: UserStatus.ACTIVE,
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { employeeId: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: peerSelect,
      orderBy: { firstName: 'asc' },
      take: 50,
    });
  }

  /** Conversation list: last message + unread count per peer. */
  async conversations(actor: AuthUser, search?: string) {
    const msgs = await this.prisma.message.findMany({
      where: { OR: [{ senderId: actor.id }, { recipientId: actor.id }] },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const byPeer = new Map<
      string,
      { last: (typeof msgs)[number]; unread: number }
    >();
    for (const m of msgs) {
      const peer = m.senderId === actor.id ? m.recipientId : m.senderId;
      const entry = byPeer.get(peer) ?? { last: m, unread: 0 };
      if (m.recipientId === actor.id && !m.readAt) entry.unread++;
      byPeer.set(peer, entry);
    }
    const peers = await this.prisma.user.findMany({
      where: { id: { in: [...byPeer.keys()] } },
      select: peerSelect,
    });
    return peers
      .filter(
        (p) =>
          !search ||
          `${p.firstName} ${p.lastName ?? ''} ${p.employeeId ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .map((p) => ({
        peer: p,
        lastMessage: byPeer.get(p.id)!.last,
        unread: byPeer.get(p.id)!.unread,
      }))
      .sort(
        (a, b) =>
          b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime(),
      );
  }

  /** Messages with one user (newest last). Marks incoming as read. */
  async thread(actor: AuthUser, peerId: string, q: ThreadQueryDto) {
    const peer = await this.assertPeer(actor, peerId);
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: actor.id, recipientId: peerId },
          { senderId: peerId, recipientId: actor.id },
        ],
        createdAt: q.before ? { lt: new Date(q.before) } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 50,
      include: {
        delivery: {
          select: { id: true, code: true, deliveryAddress: true, status: true },
        },
      },
    });
    await this.markRead(actor, peerId);
    const { businessId: _b, status: _s, ...peerInfo } = peer;
    return { peer: peerInfo, messages: messages.reverse() };
  }

  async send(actor: AuthUser, dto: SendMessageDto) {
    const peer = await this.assertPeer(actor, dto.recipientId);
    if (peer.status === UserStatus.INACTIVE)
      throw new BadRequestException('This user is inactive');
    if (
      dto.deliveryId &&
      !(await this.prisma.delivery.findFirst({
        where: {
          id: dto.deliveryId,
          businessId: peer.businessId ?? actor.businessId ?? undefined,
          AND: [await this.deliveries.scope(actor)],
        },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Delivery not found');
    const message = await this.prisma.message.create({
      data: {
        senderId: actor.id,
        recipientId: dto.recipientId,
        body: dto.body,
        deliveryId: dto.deliveryId,
      },
    });
    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    await this.notify.toUser(
      dto.recipientId,
      NotificationType.MESSAGE,
      `Message from ${sender.firstName}`,
      dto.body.slice(0, 140),
      {
        messageId: message.id,
        senderId: actor.id,
      },
    );
    return message;
  }

  async markRead(actor: AuthUser, peerId: string) {
    const res = await this.prisma.message.updateMany({
      where: { senderId: peerId, recipientId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: res.count };
  }
}
