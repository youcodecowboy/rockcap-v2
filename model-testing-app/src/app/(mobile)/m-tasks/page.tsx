import { CheckSquare } from 'lucide-react';
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileTasks() {
  return (
    <MobilePlaceholder
      title="Tasks"
      description="View and manage tasks"
      icon={CheckSquare}
    />
  );
}
