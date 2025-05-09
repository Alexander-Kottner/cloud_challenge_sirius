import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getApiInfo() {
    return {
      name: 'Cloud Storage API',
      description: 'API for secure cloud file storage with multi-provider support',
      version: '1.0.0',
      endpoints: {
        auth: {
          login: '/auth/login',
          register: '/auth/register',
        },
        files: {
          list: '/files',
          upload: '/files/upload',
          getById: '/files/:id',
          download: '/files/download/:id',
          delete: '/files/:id',
        },
        stats: {
          stats: '/stats',
        }
      }
    };
  }
}
