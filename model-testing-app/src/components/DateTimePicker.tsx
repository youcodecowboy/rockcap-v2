'use client';

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  date: Date | undefined;
  time: string; // HH:mm format
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  className?: string;
  disabled?: boolean;
}

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  className,
  disabled = false,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    try {
      if (selectedDate) {
        // Create a new date object to avoid mutating the original
        const newDate = new Date(selectedDate);
        
        // Preserve the time when changing date
        if (time) {
          const [hours, minutes] = time.split(':').map(Number);
          if (!isNaN(hours) && !isNaN(minutes)) {
            newDate.setHours(hours, minutes, 0, 0);
          }
        }
        onDateChange(newDate);
        // Close the popover after selecting a date
        setIsOpen(false);
      } else {
        onDateChange(undefined);
      }
    } catch (error) {
      console.error('Error selecting date:', error);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    onTimeChange(newTime);
    
    // Update the date object with the new time
    if (date && newTime) {
      const [hours, minutes] = newTime.split(':').map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);
      onDateChange(newDate);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="grid grid-cols-2 gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !date && "text-gray-500"
              )}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              initialFocus
              defaultMonth={date || new Date()}
            />
          </PopoverContent>
        </Popover>
        
        <div className="relative">
          <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="time"
            value={time}
            onChange={handleTimeChange}
            className="pl-10"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

