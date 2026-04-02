interface MobilePlaceholderProps {
  title: string;
  description: string;
  icon: string;
}

export default function MobilePlaceholder({ title, description, icon }: MobilePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-400 max-w-xs">{description}</p>
    </div>
  );
}
