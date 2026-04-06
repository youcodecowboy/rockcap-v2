import { FileText } from 'lucide-react';
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileNotes() {
  return (
    <MobilePlaceholder
      title="Notes"
      description="View and create notes"
      icon={FileText}
    />
  );
}
