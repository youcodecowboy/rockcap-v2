'use client';

import { useState, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';

interface DirectUploadButtonProps {
  clientId: Id<"clients">;
  clientName: string;
  projectId?: Id<"projects">;
  projectName?: string;
  isBaseDocument: boolean;
  onUploadComplete?: () => void;
}

export default function DirectUploadButton({
  clientId,
  clientName,
  projectId,
  projectName,
  isBaseDocument,
  onUploadComplete,
}: DirectUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDocument = useMutation(api.directUpload.uploadDocumentDirect);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Truncate text for display
  const truncateText = (text: string, maxLength: number = 20) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  // Get upload destination label
  const getUploadLabel = () => {
    if (isBaseDocument) {
      return `Upload to Base Documents`;
    } else if (projectName) {
      return `Upload to ${truncateText(projectName)}`;
    } else {
      return `Upload to ${truncateText(clientName)}`;
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      // Step 1: Generate upload URL and upload file to Convex storage
      const uploadUrl = await generateUploadUrl();
      
      if (!uploadUrl || typeof uploadUrl !== 'string') {
        throw new Error('Invalid upload URL received from Convex');
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        const statusText = uploadResponse.statusText || 'Unknown error';
        const errorText = await uploadResponse.text().catch(() => 'Could not read error response');
        const errorMessage = `Failed to upload file: HTTP ${uploadResponse.status} ${statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`;
        console.error('[DirectUploadButton] Upload failed:', {
          status: uploadResponse.status,
          statusText,
          errorText: errorText.substring(0, 500),
        });
        throw new Error(errorMessage);
      }

      const storageIdText = await uploadResponse.text();
      let fileStorageId: Id<"_storage">;
      try {
        const responseData = JSON.parse(storageIdText);
        fileStorageId = responseData.storageId as Id<"_storage">;
      } catch {
        fileStorageId = storageIdText.trim() as Id<"_storage">;
      }

      // Step 2: Analyze file with AI
      const formData = new FormData();
      formData.append('file', file);

      const analyzeResponse = await fetch('/api/analyze-file', {
        method: 'POST',
        body: formData,
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.error || 'Failed to analyze file');
      }

      const analysisResult = await analyzeResponse.json();

      // Step 3: Create document with analysis results
      await uploadDocument({
        fileStorageId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        clientId,
        clientName,
        projectId,
        projectName,
        isBaseDocument,
        summary: analysisResult.summary,
        fileTypeDetected: analysisResult.fileType,
        category: analysisResult.category,
        reasoning: analysisResult.reasoning,
        confidence: analysisResult.confidence,
        tokensUsed: analysisResult.tokensUsed,
        extractedData: analysisResult.extractedData,
      });

      // Show success message
      alert(`Document "${file.name}" has been uploaded and analyzed successfully.`);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Call completion callback
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Failed to upload document'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
        accept=".pdf,.docx,.doc,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="gap-2"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {getUploadLabel()}
          </>
        )}
      </Button>
    </>
  );
}

