import { useState, useEffect, useCallback, useRef } from 'react';
import { Photo, PhotoSource } from '../types/photos';
import { getPhotos } from '../api/photos';

interface UsePhotosReturn {
  currentPhoto: Photo | null;
  nextPhoto: () => void;
  previousPhoto: () => void;
  isActive: boolean;
  setActive: (active: boolean) => void;
  photoCount: number;
  currentIndex: number;
}

const DEFAULT_INTERVAL = 30; // seconds

export function usePhotos(
  sources: PhotoSource[] = ['ha_media', 'local'],
  intervalSeconds: number = DEFAULT_INTERVAL,
): UsePhotosReturn {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setActive] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadRef = useRef<HTMLImageElement | null>(null);

  // Load photos on mount
  useEffect(() => {
    let cancelled = false;

    getPhotos(sources).then((result) => {
      if (!cancelled) {
        setPhotos(result);
        setCurrentIndex(0);
      }
    }).catch(console.error);

    return () => { cancelled = true; };
  }, [sources.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload the next photo for smooth transitions
  useEffect(() => {
    if (photos.length < 2) return;
    const nextIdx = (currentIndex + 1) % photos.length;
    const img = new Image();
    img.src = photos[nextIdx].url;
    preloadRef.current = img;
  }, [currentIndex, photos]);

  // Auto-cycle timer
  useEffect(() => {
    if (!isActive || photos.length < 2) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, intervalSeconds * 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, photos.length, intervalSeconds]);

  const nextPhoto = useCallback(() => {
    if (photos.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const previousPhoto = useCallback(() => {
    if (photos.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const currentPhoto = photos.length > 0 ? photos[currentIndex] : null;

  return {
    currentPhoto,
    nextPhoto,
    previousPhoto,
    isActive,
    setActive,
    photoCount: photos.length,
    currentIndex,
  };
}
