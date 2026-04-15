import { View, Text, Image, Dimensions } from 'react-native';
import Pdf from 'react-native-pdf';
import { WebView } from 'react-native-webview';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface DocumentRendererProps {
  fileUrl: string;
  fileType: string;
  fileName: string;
}

export default function DocumentRenderer({ fileUrl, fileType, fileName }: DocumentRendererProps) {
  const ext = fileType.toLowerCase();
  const { width, height } = Dimensions.get('window');

  if (ext === 'pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    return (
      <View className="flex-1">
        <Pdf
          source={{ uri: fileUrl, cache: true }}
          style={{ flex: 1, width, height: height - 120 }}
          enablePaging
          onError={(error) => console.log('PDF error:', error)}
          onLoadComplete={(numberOfPages) => console.log(`PDF loaded: ${numberOfPages} pages`)}
        />
      </View>
    );
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
    return (
      <View className="flex-1 bg-m-bg-brand items-center justify-center">
        <Image source={{ uri: fileUrl }} style={{ width, height: height - 120 }} resizeMode="contain" />
      </View>
    );
  }

  if (['xlsx', 'xls'].includes(ext) || /\.(xlsx|xls)$/i.test(fileName)) {
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

  if (['docx', 'doc'].includes(ext) || /\.(docx|doc)$/i.test(fileName)) {
    return (
      <WebView
        source={{ uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}` }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => <LoadingSpinner message="Loading document..." />}
      />
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-m-text-primary font-medium text-base">Preview not available</Text>
      <Text className="text-m-text-tertiary text-sm text-center mt-2">
        {fileName} ({ext.toUpperCase()}) cannot be previewed on mobile
      </Text>
    </View>
  );
}
