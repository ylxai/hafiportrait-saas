import { v2 as cloudinary } from 'cloudinary';

export { cloudinary };

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

interface CloudinaryConfig {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}

export function getCloudinaryClient(credentials: CloudinaryCredentials): CloudinaryConfig {
  if (!credentials || !credentials.cloudName || !credentials.apiKey || !credentials.apiSecret) {
    throw new Error('Invalid or missing Cloudinary credentials from database');
  }

  return {
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
  };
}

export function generateThumbnailUrl(publicId: string, width = 400, height = 400, credentials?: CloudinaryCredentials): string {
  const config = credentials ? getCloudinaryClient(credentials) : undefined;
  
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
    fetch_format: 'auto',
    cloud_name: config?.cloud_name,
    secure: true,
  });
}

export function generateMediumUrl(publicId: string, width = 800, credentials?: CloudinaryCredentials): string {
  const config = credentials ? getCloudinaryClient(credentials) : undefined;

  return cloudinary.url(publicId, {
    width,
    crop: 'limit',
    quality: 'auto',
    format: 'auto',
    fetch_format: 'auto',
    cloud_name: config?.cloud_name,
    secure: true,
  });
}

export function generatePreviewUrl(publicId: string, width = 200, credentials?: CloudinaryCredentials): string {
  const config = credentials ? getCloudinaryClient(credentials) : undefined;

  return cloudinary.url(publicId, {
    width,
    crop: 'scale',
    quality: 'auto:low',
    format: 'auto',
    fetch_format: 'auto',
    cloud_name: config?.cloud_name,
    secure: true,
  });
}

export async function uploadToCloudinary(
  file: Buffer,
  folder: string = 'photos',
  credentials: CloudinaryCredentials
): Promise<{ publicId: string; url: string }> {
  const clientConfig = getCloudinaryClient(credentials);

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          cloud_name: clientConfig.cloud_name,
          api_key: clientConfig.api_key,
          api_secret: clientConfig.api_secret,
          folder,
          resource_type: 'image',
          transformation: [
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error: Error | undefined, result: { public_id: string; secure_url: string } | undefined) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve({
              publicId: result.public_id,
              url: result.secure_url,
            });
          }
        }
      )
      .end(file);
  });
}

export async function deleteFromCloudinary(publicId: string, credentials: CloudinaryCredentials): Promise<void> {
  const clientConfig = getCloudinaryClient(credentials);
  
  cloudinary.config({
    cloud_name: clientConfig.cloud_name,
    api_key: clientConfig.api_key,
    api_secret: clientConfig.api_secret,
  });

  await cloudinary.uploader.destroy(publicId);
}

export function getCloudinaryPublicId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex !== -1) {
      const publicIdParts = pathParts.slice(uploadIndex + 1);
      if (publicIdParts[0]?.startsWith('v')) {
        publicIdParts.shift();
      }
      return publicIdParts.join('/');
    }
    return null;
  } catch {
    return null;
  }
}