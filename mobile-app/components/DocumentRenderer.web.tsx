import { View, Text } from 'react-native';

interface DocumentRendererProps {
  fileUrl: string;
  fileType: string;
  fileName: string;
}

export default function DocumentRenderer({ fileUrl, fileType, fileName }: DocumentRendererProps) {
  const ext = fileType.toLowerCase();

  // Images work on web via react-native-web
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <img src={fileUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontWeight: '500', fontSize: 16 }}>Preview not available on web</Text>
      <Text style={{ fontSize: 14, textAlign: 'center', marginTop: 8, opacity: 0.6 }}>
        {fileName} ({ext.toUpperCase()}) requires the native app
      </Text>
    </View>
  );
}
