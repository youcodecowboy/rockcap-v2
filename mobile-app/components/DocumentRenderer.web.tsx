import { View, Text } from 'react-native';
import { useColors } from '@/lib/useColors';

interface DocumentRendererProps {
  fileUrl: string;
  fileType: string;
  fileName: string;
}

export default function DocumentRenderer({ fileUrl, fileType, fileName }: DocumentRendererProps) {
  const c = useColors();
  const ext = fileType.toLowerCase();

  // Images work on web via react-native-web
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.base }}>
        <img src={fileUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.bg.base }}>
      <Text style={{ fontWeight: '500', fontSize: 16, color: c.text.primary }}>Preview not available on web</Text>
      <Text style={{ fontSize: 14, textAlign: 'center', marginTop: 8, color: c.text.muted }}>
        {fileName} ({ext.toUpperCase()}) requires the native app
      </Text>
    </View>
  );
}
