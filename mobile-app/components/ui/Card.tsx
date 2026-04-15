import { View } from 'react-native';
import type { ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export default function Card({ children, className = '', ...props }: CardProps) {
  return (
    <View
      className={`bg-m-bg-card rounded-xl p-4 border border-m-border ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
