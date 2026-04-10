'use client';

import { useState, useEffect, useRef } from 'react';
import Image, { ImageProps } from 'next/image';
import { ImageIcon } from 'lucide-react';

interface LazyImageProps extends Omit<ImageProps, 'src'> {
  src: string;
  alt: string;
  fallbackSrc?: string;
  skeletonClassName?: string;
  wrapperClassName?: string;
}

export function LazyImage({
  src,
  alt,
  fallbackSrc,
  className = '',
  wrapperClassName = '',
  skeletonClassName = '',
  priority = false,
  fill,
  width,
  height,
  ...props
}: LazyImageProps) {
  const [isIntersecting, setIsIntersecting] = useState(priority);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [priority]);

  // Automatically apply Cloudinary f_auto, q_auto optimizations
  const getOptimizedSrc = (url: string) => {
    if (!url) return url;
    if (url.includes('cloudinary.com') && !url.includes('f_auto')) {
      return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }
    return url;
  };

  const displaySrc = getOptimizedSrc(hasError && fallbackSrc ? fallbackSrc : src);

  const getStyleValue = (val: number | string | undefined, defaultVal: string) => {
    if (val === undefined || val === null) return defaultVal;
    return typeof val === 'number' ? `${val}px` : val;
  };

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${fill ? 'w-full h-full absolute inset-0' : ''} ${wrapperClassName}`}
      style={!fill ? { width: getStyleValue(width, '100%'), height: getStyleValue(height, '100%') } : {}}
    >
      {(!isLoaded || (hasError && !fallbackSrc)) && (
        <div className={`absolute inset-0 flex items-center justify-center bg-muted/30 animate-pulse ${skeletonClassName}`}>
          <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
        </div>
      )}

      {(isIntersecting || priority) && (!hasError || fallbackSrc) && (
        <Image
          src={displaySrc}
          alt={alt}
          fill={fill}
          width={fill ? undefined : (width || 500)}
          height={fill ? undefined : (height || 500)}
          className={`transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          priority={priority}
          {...props}
        />
      )}
      
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-xs text-muted-foreground">Error loading image</span>
        </div>
      )}
    </div>
  );
}
