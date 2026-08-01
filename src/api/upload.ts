import { request } from './http';

export const uploadApi = {
  image(file: File) {
    return request.upload<{ url: string; filename: string }>('/upload/image', file);
  },
  cert(file: File) {
    return request.upload<{ url: string; filename: string }>('/upload/cert', file);
  },
};
