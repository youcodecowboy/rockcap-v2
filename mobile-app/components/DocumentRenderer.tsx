import { View, Text, Image, Dimensions } from 'react-native';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// These are native modules that require a dev build (not available in Expo Go).
// We lazy-require them so the app doesn't crash on import.
let Pdf: any = null;
let WebView: any = null;

try {
  Pdf = require('react-native-pdf').default;
} catch {
  // Not available in Expo Go
}

try {
  WebView = require('react-native-webview').WebView;
} catch {
  // Not available in Expo Go
}

interface DocumentRendererProps {
  fileUrl: string;
  fileType: string;
  fileName: string;
}

function NativeModuleUnavailable({ moduleName }: { moduleName: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-m-text-primary font-medium text-base">
        Dev build required
      </Text>
      <Text className="text-m-text-tertiary text-sm text-center mt-2">
        {moduleName} requires a development build. Run `eas build` to create one.
      </Text>
    </View>
  );
}

export default function DocumentRenderer({ fileUrl, fileType, fileName }: DocumentRendererProps) {
  const ext = fileType.toLowerCase();
  const { width, height } = Dimensions.get('window');

  // PDF
  if (ext === 'pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    if (!Pdf) return <NativeModuleUnavailable moduleName="PDF viewer" />;
    return (
      <View className="flex-1">
        <Pdf
          source={{ uri: fileUrl, cache: true }}
          style={{ flex: 1, width, height: height - 120 }}
          enablePaging
          onError={(error: any) => console.log('PDF error:', error)}
          onLoadComplete={(numberOfPages: number) => console.log(`PDF loaded: ${numberOfPages} pages`)}
        />
      </View>
    );
  }

  // Images (native — works in Expo Go)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
    return (
      <View className="flex-1 bg-m-bg-brand items-center justify-center">
        <Image source={{ uri: fileUrl }} style={{ width, height: height - 120 }} resizeMode="contain" />
      </View>
    );
  }

  // XLSX — WebView
  if (['xlsx', 'xls'].includes(ext) || /\.(xlsx|xls)$/i.test(fileName)) {
    if (!WebView) return <NativeModuleUnavailable moduleName="Spreadsheet viewer" />;
    const embeddedUrl = `${process.env.EXPO_PUBLIC_WEB_URL || 'https://your-app.vercel.app'}/m-docs/view?fileUrl=${encodeURIComponent(fileUrl)}&embedded=true`;
    return (
      <WebView
        source={{ uri: embeddedUrl }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => <LoadingSpinner message="Loading spreadsheet..." />}
      />
    );
  }

  // DOCX — WebView via Google Docs
  if (['docx', 'doc'].includes(ext) || /\.(docx|doc)$/i.test(fileName)) {
    if (!WebView) return <NativeModuleUnavailable moduleName="Document viewer" />;
    return (
      <WebView
        source={{ uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}` }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => <LoadingSpinner message="Loading document..." />}
      />
    );
  }

  // Unsupported type
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-m-text-primary font-medium text-base">Preview not available</Text>
      <Text className="text-m-text-tertiary text-sm text-center mt-2">
        {fileName} ({ext.toUpperCase()}) cannot be previewed on mobile
      </Text>
    </View>
  );
}
