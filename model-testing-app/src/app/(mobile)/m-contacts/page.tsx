import { ContactRound } from 'lucide-react';
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileContacts() {
  return (
    <MobilePlaceholder
      title="Contacts"
      description="Browse contacts with click-to-call"
      icon={ContactRound}
    />
  );
}
