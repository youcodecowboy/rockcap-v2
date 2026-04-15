import { View, Text, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { ArrowLeft, Camera, FileUp, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';

type Mode = 'choose' | 'camera' | 'preview' | 'uploading';

export default function UploadScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);

  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);

  const handleCameraCapture = async () => {
    if (!cameraRef) return;
    const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
    if (photo) {
      setCapturedPhoto(photo.uri);
      setMode('preview');
    }
  };

  const handleUploadPhoto = async () => {
    if (!capturedPhoto || !selectedClientId) {
      Alert.alert('Select a client', 'Please select a client before uploading.');
      return;
    }

    setUploading(true);
    try {
      let coords: { latitude: number; longitude: number } | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          coords = location.coords;
        }
      } catch {}

      const uploadUrl = await generateUploadUrl();
      const response = await fetch(capturedPhoto);
      const blob = await response.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      const { storageId } = await uploadResponse.json();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await createDocument({
        fileStorageId: storageId,
        fileName: `Site-Photo-${timestamp}.jpg`,
        fileType: 'jpg',
        category: 'Photographs',
        clientId: selectedClientId as any,
        scope: 'client-specific',
        metadata: coords
          ? { source: 'mobile-capture', latitude: coords.latitude, longitude: coords.longitude }
          : { source: 'mobile-capture' },
      } as any);

      Alert.alert('Uploaded', 'Photo saved to Captured Photos folder.');
      setCapturedPhoto(null);
      setMode('choose');
    } catch (error) {
      Alert.alert('Upload failed', 'Please try again.');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/vnd.openxmlformats-officedocument.*'],
      multiple: true,
    });

    if (result.canceled) return;

    Alert.alert(
      'Files selected',
      `${result.assets.length} file(s) selected. Batch upload flow coming in next iteration.`
    );
  };

  // Camera mode
  if (mode === 'camera') {
    if (!permission?.granted) {
      return (
        <View className="flex-1 bg-m-bg-brand items-center justify-center px-8">
          <Text className="text-m-text-on-brand text-center mb-4">
            Camera access is needed to capture site photos
          </Text>
          <TouchableOpacity onPress={requestPermission} className="bg-white rounded-lg px-6 py-3">
            <Text className="text-m-text-primary font-medium">Grant Access</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="flex-1 bg-black">
        <CameraView ref={(ref) => setCameraRef(ref)} style={{ flex: 1 }} facing="back">
          <View className="flex-1 justify-end pb-12">
            <View className="flex-row items-center justify-center gap-8">
              <TouchableOpacity
                onPress={() => setMode('choose')}
                className="w-12 h-12 rounded-full bg-white/20 items-center justify-center"
              >
                <X size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCameraCapture}
                className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
              >
                <View className="w-16 h-16 rounded-full bg-white" />
              </TouchableOpacity>
              <View className="w-12" />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // Preview mode
  if (mode === 'preview' && capturedPhoto) {
    return (
      <View className="flex-1 bg-m-bg-brand">
        <Image source={{ uri: capturedPhoto }} style={{ flex: 1 }} resizeMode="contain" />
        <View className="absolute bottom-0 left-0 right-0 pb-12 pt-4 px-6 bg-black/50">
          <ScrollView horizontal className="mb-4" showsHorizontalScrollIndicator={false}>
            {clients?.map((c) => (
              <TouchableOpacity
                key={c._id}
                onPress={() => setSelectedClientId(c._id)}
                className={`mr-2 px-4 py-2 rounded-full ${selectedClientId === c._id ? 'bg-white' : 'bg-white/20'}`}
              >
                <Text className={`text-sm font-medium ${selectedClientId === c._id ? 'text-black' : 'text-white'}`}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={() => { setCapturedPhoto(null); setMode('camera'); }}
              className="flex-1 bg-white/20 rounded-xl py-3.5 items-center"
            >
              <Text className="text-white font-medium">Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleUploadPhoto}
              disabled={uploading || !selectedClientId}
              className="flex-1 bg-white rounded-xl py-3.5 items-center"
              style={{ opacity: uploading || !selectedClientId ? 0.5 : 1 }}
            >
              <Text className="text-black font-medium">
                {uploading ? 'Uploading...' : 'Save Photo'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Choose mode (default)
  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft size={20} color={colors.textOnBrand} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-m-text-on-brand">Upload</Text>
      </View>

      <View className="flex-1 px-4 pt-6 gap-4">
        <TouchableOpacity
          onPress={() => setMode('camera')}
          className="bg-m-bg-card border border-m-border rounded-xl p-6 items-center gap-3"
        >
          <Camera size={32} color={colors.textPrimary} />
          <Text className="text-base font-medium text-m-text-primary">Capture Site Photo</Text>
          <Text className="text-sm text-m-text-tertiary text-center">
            Take a photo and save it directly to the project folder
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleFilePick}
          className="bg-m-bg-card border border-m-border rounded-xl p-6 items-center gap-3"
        >
          <FileUp size={32} color={colors.textPrimary} />
          <Text className="text-base font-medium text-m-text-primary">Upload Documents</Text>
          <Text className="text-sm text-m-text-tertiary text-center">
            Pick files from your device to upload and classify
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
