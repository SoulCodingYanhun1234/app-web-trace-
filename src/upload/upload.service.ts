import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { customAlphabet } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

type UploadKind = 'images' | 'certs';

type CompressionResult = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  compressed: boolean;
  originalSize: number;
};

const rules: Record<UploadKind, { maxSize: number; extensions: string[]; mimeTypes: string[] }> = {
  images: {
    maxSize: Number(process.env.UPLOAD_IMAGE_MAX_BYTES || 5 * 1024 * 1024),
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'],
  },
  certs: {
    maxSize: Number(process.env.UPLOAD_CERT_MAX_BYTES || 20 * 1024 * 1024),
    extensions: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'],
    mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'],
  },
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  private async readStreamToBuffer(stream: AsyncIterable<Buffer>, maxSize: number) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxSize) throw new BadRequestException(`文件过大，最大允许 ${Math.round(maxSize / 1024 / 1024)}MB`);
      chunks.push(buffer);
    }
    return { buffer: Buffer.concat(chunks), size };
  }

  private outputFormatForImage(ext: string, mimeType: string) {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized.includes('png') || ext === '.png') return { format: 'png', extension: '.png', mimeType: 'image/png' };
    if (normalized.includes('jpeg') || normalized.includes('jpg') || ['.jpg', '.jpeg'].includes(ext)) return { format: 'jpeg', extension: '.jpg', mimeType: 'image/jpeg' };
    return null;
  }

  private extensionFromMime(contentType: string, fallback: string) {
    const type = contentType.toLowerCase();
    if (type.includes('png')) return '.png';
    if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
    return fallback;
  }

  private hasMagic(buffer: Buffer, bytes: number[]) {
    return bytes.every((value, index) => buffer[index] === value);
  }

  private isZipLike(buffer: Buffer) {
    return this.hasMagic(buffer, [0x50, 0x4b, 0x03, 0x04])
      || this.hasMagic(buffer, [0x50, 0x4b, 0x05, 0x06])
      || this.hasMagic(buffer, [0x50, 0x4b, 0x07, 0x08]);
  }

  private assertFileSignature(buffer: Buffer, ext: string, mimeType: string) {
    if (!buffer.length) throw new BadRequestException('文件内容为空');
    const lowerMime = String(mimeType || '').toLowerCase();
    const asciiHead = buffer.subarray(0, 16).toString('ascii');
    const textHead = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8');

    const imageOk = (() => {
      if (['.jpg', '.jpeg'].includes(ext)) return this.hasMagic(buffer, [0xff, 0xd8, 0xff]);
      if (ext === '.png') return this.hasMagic(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (ext === '.gif') return asciiHead.startsWith('GIF87a') || asciiHead.startsWith('GIF89a');
      if (ext === '.webp') return asciiHead.startsWith('RIFF') && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      if (ext === '.ico') return this.hasMagic(buffer, [0x00, 0x00, 0x01, 0x00]);
      return false;
    })();

    if (lowerMime.startsWith('image/') || rules.images.extensions.includes(ext)) {
      if (!imageOk) throw new BadRequestException('文件内容与图片类型不匹配');
      return;
    }

    if (ext === '.pdf' && !asciiHead.startsWith('%PDF-')) throw new BadRequestException('PDF 文件内容不合法');
    if (ext === '.docx' && !this.isZipLike(buffer)) throw new BadRequestException('DOCX 文件内容不合法');
    if (ext === '.doc' && !this.hasMagic(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) throw new BadRequestException('DOC 文件内容不合法');
    if (/<script[\s>]/i.test(textHead) || /javascript:/i.test(textHead)) throw new BadRequestException('文件内容包含不安全脚本');
  }

  private async compressImageIfNeeded(input: Buffer, originalName: string, ext: string, mimeType: string): Promise<CompressionResult> {
    const output = this.outputFormatForImage(ext, mimeType);
    if (!output) return { buffer: input, mimeType, extension: ext, compressed: false, originalSize: input.length };

    const enabled = this.config.get<string>('UAPI_IMAGE_COMPRESS_ENABLED', 'true') !== 'false';
    if (!enabled) return { buffer: input, mimeType, extension: ext, compressed: false, originalSize: input.length };

    const endpoint = this.config.get<string>('UAPI_IMAGE_COMPRESS_URL', 'https://uapis.cn/api/v1/image/compress');
    const level = Math.min(Math.max(Number(this.config.get('UAPI_IMAGE_COMPRESS_LEVEL', 3)) || 3, 1), 5);
    const timeoutMs = Math.max(Number(this.config.get('UAPI_IMAGE_COMPRESS_TIMEOUT_MS', 8000)) || 8000, 1000);
    const key = this.config.get<string>('UAPI_KEY') || this.config.get<string>('UAPI_API_KEY') || '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(endpoint);
      url.searchParams.set('level', String(level));
      url.searchParams.set('format', output.format);

      const form = new FormData();
      const body = new Blob([new Uint8Array(input.buffer, input.byteOffset, input.length)], { type: mimeType || output.mimeType });
      form.append('file', body, originalName || `upload${ext}`);

      const headers: Record<string, string> = { Accept: 'image/*' };
      if (key) {
        headers.Authorization = `Bearer ${key}`;
        headers['X-API-Key'] = key;
      }

      const response = await fetch(url, { method: 'POST', body: form, headers, signal: controller.signal });
      if (!response.ok) throw new Error(`UAPI 图片压缩失败：${response.status}`);
      const contentType = response.headers.get('content-type') || output.mimeType;
      if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`UAPI 图片压缩返回类型异常：${contentType}`);
      const compressed = Buffer.from(await response.arrayBuffer());

      if (!compressed.length || compressed.length >= input.length) return { buffer: input, mimeType, extension: ext, compressed: false, originalSize: input.length };
      return {
        buffer: compressed,
        mimeType: contentType.split(';')[0] || output.mimeType,
        extension: this.extensionFromMime(contentType, output.extension),
        compressed: true,
        originalSize: input.length,
      };
    } catch (error: any) {
      this.logger.warn(`UAPI image compress skipped: ${error?.message || error}`);
      return { buffer: input, mimeType, extension: ext, compressed: false, originalSize: input.length };
    } finally {
      clearTimeout(timer);
    }
  }

  async saveFastifyFile(file: any, kind: UploadKind) {
    if (!file) throw new BadRequestException('未选择文件');
    const rule = rules[kind];
    const originalName = String(file.filename || 'file').replace(/[\r\n]/g, '').slice(0, 180);
    const ext = path.extname(originalName).toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!rule.extensions.includes(ext)) throw new BadRequestException('文件扩展名不允许');
    if (mimeType && !rule.mimeTypes.includes(mimeType)) throw new BadRequestException('文件 MIME 类型不允许');

    const { buffer: originalBuffer, size: originalSize } = await this.readStreamToBuffer(file.file, rule.maxSize);
    this.assertFileSignature(originalBuffer, ext, mimeType);
    const shouldCompress = mimeType.startsWith('image/') && ['.jpg', '.jpeg', '.png'].includes(ext);
    const processed = shouldCompress
      ? await this.compressImageIfNeeded(originalBuffer, originalName, ext, mimeType)
      : { buffer: originalBuffer, mimeType, extension: ext, compressed: false, originalSize };

    const uploadDir = this.config.get<string>('UPLOAD_DIR', 'uploads');
    const dir = path.resolve(process.cwd(), uploadDir, kind);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}_${nanoid()}${processed.extension}`;
    const diskPath = path.join(dir, filename);

    try {
      await fs.writeFile(diskPath, processed.buffer);
    } catch (error) {
      await fs.rm(diskPath, { force: true }).catch(() => undefined);
      throw error;
    }

    const publicUrl = `/uploads/${kind}/${filename}`;
    await this.prisma.uploadedFile.create({
      data: {
        file_name: filename,
        original_name: originalName,
        mime_type: processed.mimeType || mimeType || file.mimetype,
        size_bytes: processed.buffer.length,
        storage_path: diskPath,
        public_url: publicUrl,
        category: kind,
      },
    }).catch(() => undefined);

    return {
      url: publicUrl,
      filename,
      size: processed.buffer.length,
      original_size: processed.originalSize,
      compressed: processed.compressed,
      compression_rate: processed.compressed ? Number((1 - processed.buffer.length / Math.max(processed.originalSize, 1)).toFixed(4)) : 0,
    };
  }
}
