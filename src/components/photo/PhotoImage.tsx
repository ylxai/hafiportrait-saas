'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { getCloudinaryThumbnailUrl } from '@/lib/cloudinary';

interface PhotoImageProps {
  src: string; // R2 public URL
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
}

export function PhotoImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  className = '',
  priority = false,
}: PhotoImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  // Generate Cloudinary thumbnail URL from R2 URL
  const thumbnailUrl = getCloudinaryThumbnailUrl(src, {
    width: fill ? 400 : width || 400,
    height: fill ? 400 : height,
    quality: 'auto',
    format: 'auto',
  });

  const finalSrc = useFallback ? src : (thumbnailUrl || src);

  if (hasError) {
    return (
      <div className={`bg-card flex items-center justify-center border border-border rounded-lg ${className}`}>
        <span className="text-muted-foreground text-xs">Failed to load</span>
      </div>
    );
  }

  return (
    <div className={`relative ${fill ? 'w-full h-full' : ''} ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center z-10 rounded-lg">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      )}
      <Image
        src={finalSrc}
        alt={alt}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        sizes={sizes}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          if (!useFallback) {
            setUseFallback(true);
            setIsLoading(true);
          } else {
            setIsLoading(false);
            setHasError(true);
          }
        }}
        priority={priority}
      />
    </div>
  );
}
