import { getCloudinaryConfig } from './storage/accounts';

/**
 * Generate Cloudinary fetch URL from R2 public URL
 * Cloudinary will auto-fetch from R2, resize, and cache the result
 * 
 * @param r2Url - R2 public URL (original image)
 * @param options - Resize options
 * @returns Cloudinary fetch URL
 */
export function getCloudinaryThumbnailUrl(
  r2Url: string,
  options: {
    width?: number;
    height?: number;
    quality?: 'auto' | 'auto:good' | number;
    format?: 'auto' | 'webp' | 'jpg' | 'png';
    cloudName?: string;
  } = {}
): string {
  const { 
    width = 400, 
    height, 
    quality = 'auto:good',
    format = 'auto',
    cloudName: explicitCloudName
  } = options;

  const cloudName = explicitCloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  
  if (!cloudName) {
    console.error('Cloudinary cloud name not configured');
    return r2Url; // Fallback to original
  }

  // Build transformation string
  const transforms: string[] = [];
  
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if (width && height) transforms.push('c_fill'); // Crop to fill
  else if (width || height) transforms.push('c_limit'); // Limit dimensions
  
  transforms.push(`q_${quality}`);
  transforms.push(`f_${format}`);

  // Encode R2 URL
  const encodedUrl = encodeURIComponent(r2Url);

  // Build Cloudinary fetch URL
  // Format: https://res.cloudinary.com/<cloud>/image/fetch/<transforms>/<encoded-url>
  return `https://res.cloudinary.com/${cloudName}/image/fetch/${transforms.join(',')}/${encodedUrl}`;
}

/**
 * Generate Cloudinary fetch URL with cloud name from database (async version)
 * Use this in server-side code (API routes, server components)
 * 
 * @param r2Url - R2 public URL (original image)
 * @param options - Resize options
 * @returns Cloudinary fetch URL
 */
export async function getCloudinaryThumbnailUrlAsync(
  r2Url: string,
  options: {
    width?: number;
    height?: number;
    quality?: 'auto' | 'auto:good' | number;
    format?: 'auto' | 'webp' | 'jpg' | 'png';
    cloudName?: string;
  } = {}
): Promise<string> {
  const { cloudName: explicitCloudName, ...restOptions } = options;
  
  // If cloudName explicitly provided, use sync version
  if (explicitCloudName) {
    return getCloudinaryThumbnailUrl(r2Url, options);
  }
  
  // Otherwise, fetch from database
  try {
    const config = await getCloudinaryConfig();
    return getCloudinaryThumbnailUrl(r2Url, {
      ...restOptions,
      cloudName: config.cloudName,
    });
  } catch (error) {
    console.error('Failed to get Cloudinary config:', error);
    return r2Url; // Fallback to original
  }
}

/**
 * Get different thumbnail sizes
 */
export function getThumbnailSizes(r2Url: string, cloudName?: string) {
  return {
    small: getCloudinaryThumbnailUrl(r2Url, { width: 200, height: 200, cloudName }),
    medium: getCloudinaryThumbnailUrl(r2Url, { width: 400, height: 400, cloudName }),
    large: getCloudinaryThumbnailUrl(r2Url, { width: 800, height: 800, cloudName }),
    original: r2Url,
  };
}

/**
 * Get high-res URL for lightbox display (sharp, not blurry)
 * Uses Cloudinary with quality optimization for fast loading
 */
export function getCloudinaryLightboxUrl(
  r2Url: string,
  cloudName?: string
): string {
  return getCloudinaryThumbnailUrl(r2Url, {
    width: 1920,
    quality: 'auto:good',
    format: 'auto',
    cloudName,
  });
}

/**
 * Get high-res URL for lightbox display (async version with database config)
 * Use this in server-side code (API routes, server components)
 */
export async function getCloudinaryLightboxUrlAsync(
  r2Url: string,
  cloudName?: string
): Promise<string> {
  return getCloudinaryThumbnailUrlAsync(r2Url, {
    width: 1920,
    quality: 'auto:good',
    format: 'auto',
    cloudName,
  });
}
