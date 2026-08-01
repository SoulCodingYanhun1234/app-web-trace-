import { Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { UploadService } from './upload.service.js';

@ApiBearerAuth()
@ApiTags('上传')
@Controller('upload')
export class UploadController {
  constructor(private readonly service: UploadService) {}

  @Post('image')
  @ApiConsumes('multipart/form-data')
  async image(@Req() req: FastifyRequest) {
    const file = await (req as any).file();
    return this.service.saveFastifyFile(file, 'images');
  }

  @Post('cert')
  @ApiConsumes('multipart/form-data')
  async cert(@Req() req: FastifyRequest) {
    const file = await (req as any).file();
    return this.service.saveFastifyFile(file, 'certs');
  }
}
