import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AuthUser } from '../common/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { detectFileType } from './file-type.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Lifetime of a signed link for <img src> or document viewers. */
export const SIGNED_LINK_SECONDS = 15 * 60;

@Injectable()
export class UploadsService {
  private readonly dir: string;
  private readonly signingKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR') ?? 'uploads');
    // A key derived from the JWT secret, scoped to upload links.
    this.signingKey = createHmac(
      'sha256',
      config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update('andyesqo:upload-links:v1')
      .digest();
  }

  private path(storageKey: string) {
    return join(this.dir, storageKey);
  }

  async store(actor: AuthUser, files: Express.Multer.File[]) {
    if (!files?.length)
      throw new BadRequestException('No files uploaded (field name: files)');
    const typed = files.map((file) => {
      const type = detectFileType(file.buffer);
      if (!type)
        throw new BadRequestException(
          `${file.originalname}: only JPEG, PNG, WebP, HEIC images or PDF documents are allowed`,
        );
      return { file, type };
    });
    await mkdir(this.dir, { recursive: true });
    const saved = [];
    for (const { file, type } of typed) {
      const storageKey = `${randomUUID()}.${type.ext}`;
      await writeFile(this.path(storageKey), file.buffer, {
        flag: 'wx',
        mode: 0o600,
      });
      try {
        saved.push(
          await this.prisma.upload.create({
            data: {
              businessId: actor.businessId,
              uploadedById: actor.id,
              storageKey,
              // Control characters are stripped from the name used in downloads.
              originalName: file.originalname
                .replace(/[\u0000-\u001f"\\]/g, '_')
                .slice(0, 200),
              mimeType: type.mime,
              size: file.size,
              sha256: createHash('sha256').update(file.buffer).digest('hex'),
            },
          }),
        );
      } catch (error) {
        await rm(this.path(storageKey), { force: true });
        throw error;
      }
    }
    return saved.map((u) => ({
      id: u.id,
      url: `/api/v1/uploads/${u.id}`,
      originalName: u.originalName,
      mimetype: u.mimeType,
      size: u.size,
    }));
  }

  /**
   * Tenant users may read their business's files. Drivers and assistants may
   * read only files they uploaded; managers and admins read any file of their
   * business (they review photos, receipts and compliance documents).
   */
  async authorize(actor: AuthUser, id: string) {
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    if (
      !upload ||
      (actor.role !== UserRole.SUPER_ADMIN &&
        (upload.businessId !== actor.businessId ||
          (field && upload.uploadedById !== actor.id)))
    )
      throw new NotFoundException('File not found');
    return upload;
  }

  async read(upload: { storageKey: string }) {
    try {
      return await readFile(this.path(upload.storageKey));
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  private sign(id: string, expires: number) {
    return createHmac('sha256', this.signingKey)
      .update(`${id}.${expires}`)
      .digest('base64url');
  }

  async signedLink(actor: AuthUser, id: string) {
    await this.authorize(actor, id);
    const expires = Math.floor(Date.now() / 1000) + SIGNED_LINK_SECONDS;
    return {
      url: `/api/v1/uploads/${id}/content?expires=${expires}&signature=${this.sign(id, expires)}`,
      expiresAt: new Date(expires * 1000),
    };
  }

  async verifySigned(id: string, expires: number, signature: string) {
    const expected = Buffer.from(this.sign(id, expires));
    const given = Buffer.from(signature ?? '');
    if (
      !Number.isInteger(expires) ||
      expires < Date.now() / 1000 ||
      expected.length !== given.length ||
      !timingSafeEqual(expected, given)
    )
      throw new NotFoundException('File not found');
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    if (!upload) throw new NotFoundException('File not found');
    return upload;
  }
}
