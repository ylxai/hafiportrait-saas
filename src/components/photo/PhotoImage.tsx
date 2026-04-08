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

  // Generate Cloudinary thumbnail URL from R2 URL
  const thumbnailUrl = getCloudinaryThumbnailUrl(src, {
    width: fill ? 400 : width || 400,
    height: fill ? 400 : height,
    quality: 'auto',
    format: 'auto',
  });

  if (hasError) {
    return (
      <div className={`bg-slate-100 flex items-center justify-center ${className}`}>
        <span className="text-slate-400 text-xs">Failed to load</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-slate-50 flex items-center justify-center z-10">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      )}
      <Image
        src={thumbnailUrl}
        alt={alt}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        sizes={sizes}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        priority={priority}
        unoptimized // Cloudinary already optimized
      />
    </div>
  );
}
