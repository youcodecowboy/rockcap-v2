'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface TaskNaturalLanguageInputProps {
  onParse: (parsedData: any) => void;
  mode?: 'task' | 'reminder';
}

export default function TaskNaturalLanguageInput({ onParse, mode = 'task' }: TaskNaturalLanguageInputProps) {
  const [input, setInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const isTaskMode = mode === 'task';
  const apiEndpoint = isTaskMode ? '/api/tasks/parse' : '/api/reminders/parse';
  const bodyKey = isTaskMode ? 'taskDescription' : 'reminderDescription';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isParsing) return;

    setIsParsing(true);
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [bodyKey]: input }),
      });

      if (!response.ok) {
        throw new Error(`Failed to parse ${mode}`);
      }

      const parsedData = await response.json();
      onParse(parsedData);
      setInput('');
    } catch (error) {
      console.error(`Failed to parse ${mode}:`, error);
      alert(`Failed to parse ${mode}. Please try again.`);
    } finally {
      setIsParsing(false);
    }
  };

  const placeholder = isTaskMode
    ? "Describe your task... (e.g., 'Review loan documents for ABC Company by Friday')"
    : "Describe your reminder... (e.g., 'Call Kristian Hansen tomorrow at 3pm')";

  const buttonText = isTaskMode ? 'Create Task' : 'Create Reminder';
  const buttonColor = isTaskMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700';

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900 placeholder-gray-400"
          disabled={isParsing}
        />
        <button
          type="submit"
          disabled={!input.trim() || isParsing}
          className={`px-6 py-3 ${buttonColor} text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2 whitespace-nowrap`}
        >
          {isParsing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Parsing...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{buttonText}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

