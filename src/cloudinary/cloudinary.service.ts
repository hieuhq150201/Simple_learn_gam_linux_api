import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadAvatar(file: Express.Multer.File, userId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          public_id: `avatars/${userId}`,
          overwrite: true,
          transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve(result.secure_url);
        },
      );
      Readable.from(file.buffer).pipe(upload);
    });
  }

  async deleteAvatar(userId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(`avatars/${userId}`);
    } catch {
      // silently ignore — avatar might not exist on Cloudinary
    }
  }
}
