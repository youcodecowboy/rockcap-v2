import { Id } from "../../convex/_generated/dataModel";

export interface FolderSelection {
  type: 'client' | 'project' | 'internal' | 'personal';
  folderId: string;
  folderName: string;
  projectId?: Id<"projects">;
  parentPath?: Array<{ folderId: string; folderName: string }>;
}
