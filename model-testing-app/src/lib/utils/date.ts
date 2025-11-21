/**
 * Shared date formatting and parsing utilities
 */

/**
 * Format date to DDMMYY format (e.g., "251120" for November 25, 2020)
 * Used for document codes
 */
export function formatDateDDMMYY(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  
  return `${day}${month}${year}`;
}

/**
 * Format date in various common formats
 */
export function formatDate(date: Date | string, format: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD MMM YYYY' | 'ISO' = 'ISO'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const day = dateObj.getDate();
  const month = dateObj.getMonth() + 1;
  const year = dateObj.getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  switch (format) {
    case 'MM/DD/YYYY':
      return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
    case 'DD/MM/YYYY':
      return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    case 'MMM DD, YYYY':
      return `${monthNames[month - 1]} ${day}, ${year}`;
    case 'DD MMM YYYY':
      return `${day} ${monthNames[month - 1]} ${year}`;
    case 'ISO':
    default:
      return dateObj.toISOString();
  }
}

/**
 * Parse a date string or timestamp to ISO string
 * Handles ISO strings, timestamps in milliseconds/seconds, validates 1970 dates
 */
export function parseDate(dateValue?: string | number | null): string {
  if (!dateValue) {
    return new Date().toISOString();
  }

  // If it's already an ISO string, validate and return
  if (typeof dateValue === 'string' && dateValue.includes('T')) {
    const testDate = new Date(dateValue);
    if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
      return dateValue;
    }
    return new Date().toISOString();
  }

  // Try parsing as timestamp
  const timestamp = typeof dateValue === 'string' ? parseInt(dateValue) : dateValue;
  if (!isNaN(timestamp) && timestamp > 0) {
    // If timestamp is less than year 2000, it's likely in seconds
    const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
    if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

/**
 * Get current date/time as ISO string
 */
export function getCurrentISODate(): string {
  return new Date().toISOString();
}

/**
 * Format date for display (human-readable)
 */
export function formatDateForDisplay(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date and time for display
 */
export function formatDateTimeForDisplay(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

