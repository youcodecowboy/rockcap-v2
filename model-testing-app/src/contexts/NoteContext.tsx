'use client';

import { createContext } from 'react';
import { Id } from '../../convex/_generated/dataModel';

interface NoteContextType {
  noteId: Id<"notes"> | undefined;
  clientId: Id<"clients"> | null | undefined;
  projectId: Id<"projects"> | null | undefined;
}

export const NoteContext = createContext<NoteContextType>({
  noteId: undefined,
  clientId: undefined,
  projectId: undefined,
});

