import { View, Text } from 'react-native';

interface BadgeProps {
  count: number;
  variant?: 'default' | 'error';
}

export default function Badge({ count, variant = 'default' }: BadgeProps) {
  if (count <= 0) return null;

  const label = count > 9 ? '9+' : String(count);
  const bg = variant === 'error' ? 'bg-m-error' : 'bg-m-accent';

  return (
    <View className={`${bg} min-w-[18px] h-[18px] rounded-full items-center justify-center px-1`}>
      <Text className="text-m-text-on-brand text-[10px] font-bold leading-none">
        {label}
      </Text>
    </View>
  );
}
