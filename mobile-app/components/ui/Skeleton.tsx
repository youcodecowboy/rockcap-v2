import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useColors } from '@/lib/useColors';
import { radius, spacing } from '@/lib/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
}

// Pulsing placeholder block. Canon rule: loading states are skeletons, never spinners.
export function Skeleton({ width = '100%', height = 16, rounded = radius.sm }: SkeletonProps) {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width, height, borderRadius: rounded, backgroundColor: c.bg.cardAlt, opacity }}
    />
  );
}

// Skeleton in the shape of a list-row / card: title line + body lines, on a card surface.
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.bg.card,
        borderWidth: 1,
        borderColor: c.border.default,
        borderRadius: radius.lg,
        padding: spacing[4],
        gap: spacing[3],
      }}
    >
      <Skeleton width="45%" height={14} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={11} />
      ))}
    </View>
  );
}
