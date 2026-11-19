import {
  Controller,
  Get,
  Module,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { MAX_UPLOAD_BYTES, UploadsService } from './uploads.service.js';
import { ApiData, ApiFile } from '../common/swagger/swagger.js';
import { SignedLink, UploadedFile } from '../common/swagger/responses.dto.js';

/** Sends a stored file with headers that stop browsers executing or sniffing it. */
function sendFile(
  res: Response,
  upload: { mimeType: string; originalName: string },
  body: Buffer,
) {
  res.setHeader('Content-Type', upload.mimeType);
  res.setHeader('Content-Length', body.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(upload.originalName)}"`,
  );
  res.end(body);
}

/**
 * Photos and documents for inspections, damage reports, deliveries, fuel
 * receipts, incidents and compliance. Files are private: download them with
 * the bearer token, or request a short-lived signed link for <img> tags.
 */
@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Upload up to 10 images (JPEG, PNG, WebP, HEIC) or PDFs, 10 MB each; returns URLs to send in photo and document fields',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 10 },
    }),
  )
  @ApiData([UploadedFile], { status: 201 })
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.uploads.store(user, files);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Download a file (same business; drivers and assistants only their own uploads)',
  })
  @ApiFile()
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const upload = await this.uploads.authorize(user, id);
    sendFile(res, upload, await this.uploads.read(upload));
  }

  @Get(':id/link')
  @ApiOperation({
    summary:
      'Short-lived (15 minute) signed link for <img src> or a document viewer',
  })
  @ApiData(SignedLink)
  link(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.signedLink(user, id);
  }

  @Get(':id/content')
  @Public()
  @ApiOperation({ summary: 'Download through a signed link (no bearer token)' })
  @ApiFile()
  async signed(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expires', ParseIntPipe) expires: number,
    @Query('signature') signature: string,
    @Res() res: Response,
  ) {
    const upload = await this.uploads.verifySigned(id, expires, signature);
    sendFile(res, upload, await this.uploads.read(upload));
  }
}

@Module({ controllers: [UploadsController], providers: [UploadsService] })
export class UploadsModule {}
