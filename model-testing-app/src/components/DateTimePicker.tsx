'use client';

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button, Input } from "@/components/layouts"
import { useColors } from "@/lib/useColors"
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
  const colors = useColors();
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
              variant="secondary"
              disabled={disabled}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                fontWeight: 400,
                color: date ? colors.text.primary : colors.text.muted,
              }}
            >
              <CalendarIcon size={16} />
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

        <div style={{ position: 'relative' }}>
          <Clock size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim, pointerEvents: 'none' }} />
          <Input
            type="time"
            value={time}
            onChange={handleTimeChange}
            style={{ paddingLeft: 32 }}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
