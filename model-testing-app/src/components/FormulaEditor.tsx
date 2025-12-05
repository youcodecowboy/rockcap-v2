'use client';

import Handsontable from 'handsontable';
import { FORMULA_FUNCTIONS, FormulaFunction } from './FormulaAutocomplete';

// Custom formula editor that shows autocomplete when typing formulas (starting with =)
export class FormulaEditor extends Handsontable.editors.TextEditor {
  private autocompleteContainer: HTMLDivElement | null = null;
  private autocompleteList: HTMLDivElement | null = null;
  private selectedIndex: number = 0;
  private filteredFunctions: FormulaFunction[] = [];
  private showingAutocomplete: boolean = false;
  private query: string = '';

  // Helper getter for typed TEXTAREA access
  private get textareaElement(): HTMLTextAreaElement | null {
    return this.TEXTAREA as HTMLTextAreaElement | null;
  }

  init() {
    super.init();
  }

  prepare(
    row: number,
    col: number,
    prop: string | number,
    td: HTMLTableCellElement,
    originalValue: any,
    cellProperties: Handsontable.CellProperties
  ) {
    super.prepare(row, col, prop, td, originalValue, cellProperties);
  }

  open(event?: Event) {
    super.open(event);
    this.createAutocompleteContainer();
    this.attachInputListener();
  }

  close() {
    this.hideAutocomplete();
    this.removeAutocompleteContainer();
    super.close();
  }

  private createAutocompleteContainer() {
    if (this.autocompleteContainer) return;

    this.autocompleteContainer = document.createElement('div');
    this.autocompleteContainer.className = 'formula-autocomplete-container';
    this.autocompleteContainer.style.cssText = `
      position: fixed;
      z-index: 10002;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      max-height: 300px;
      width: 320px;
      overflow: hidden;
      display: none;
      flex-direction: column;
    `;

    // CRITICAL: Prevent mousedown from causing editor to lose focus and close
    this.autocompleteContainer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Create category tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'formula-tabs';
    tabsContainer.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 8px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      overflow-x: auto;
      flex-shrink: 0;
    `;
    tabsContainer.innerHTML = `
      <button class="formula-tab active" data-category="all" style="padding: 4px 8px; font-size: 11px; border: none; background: #dbeafe; color: #1d4ed8; border-radius: 4px; cursor: pointer; white-space: nowrap;">All</button>
      <button class="formula-tab" data-category="math" style="padding: 4px 8px; font-size: 11px; border: none; background: transparent; color: #6b7280; border-radius: 4px; cursor: pointer; white-space: nowrap;">Math</button>
      <button class="formula-tab" data-category="statistical" style="padding: 4px 8px; font-size: 11px; border: none; background: transparent; color: #6b7280; border-radius: 4px; cursor: pointer; white-space: nowrap;">Stats</button>
      <button class="formula-tab" data-category="logical" style="padding: 4px 8px; font-size: 11px; border: none; background: transparent; color: #6b7280; border-radius: 4px; cursor: pointer; white-space: nowrap;">Logical</button>
      <button class="formula-tab" data-category="text" style="padding: 4px 8px; font-size: 11px; border: none; background: transparent; color: #6b7280; border-radius: 4px; cursor: pointer; white-space: nowrap;">Text</button>
      <button class="formula-tab" data-category="lookup" style="padding: 4px 8px; font-size: 11px; border: none; background: transparent; color: #6b7280; border-radius: 4px; cursor: pointer; white-space: nowrap;">Lookup</button>
    `;
    this.autocompleteContainer.appendChild(tabsContainer);

    // Add click handlers for tabs
    tabsContainer.querySelectorAll('.formula-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const category = (tab as HTMLElement).dataset.category || 'all';
        this.filterByCategory(category);
        // Update active state
        tabsContainer.querySelectorAll('.formula-tab').forEach(t => {
          (t as HTMLElement).style.background = 'transparent';
          (t as HTMLElement).style.color = '#6b7280';
        });
        (tab as HTMLElement).style.background = '#dbeafe';
        (tab as HTMLElement).style.color = '#1d4ed8';
        // Keep focus on input
        if (this.textareaElement) {
          this.textareaElement.focus();
        }
      });
    });

    // Create list container
    this.autocompleteList = document.createElement('div');
    this.autocompleteList.className = 'formula-list';
    this.autocompleteList.style.cssText = `
      overflow-y: auto;
      flex: 1;
      max-height: 240px;
    `;
    this.autocompleteContainer.appendChild(this.autocompleteList);

    // Create footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 6px 8px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      font-size: 10px;
      color: #9ca3af;
      display: flex;
      gap: 12px;
    `;
    footer.innerHTML = `
      <span>↑↓ Navigate</span>
      <span>↵ Select</span>
      <span>Esc Close</span>
    `;
    this.autocompleteContainer.appendChild(footer);

    document.body.appendChild(this.autocompleteContainer);
  }

  private removeAutocompleteContainer() {
    if (this.autocompleteContainer) {
      this.autocompleteContainer.remove();
      this.autocompleteContainer = null;
      this.autocompleteList = null;
    }
  }

  private attachInputListener() {
    if (!this.textareaElement) return;

    const inputHandler = () => {
      const value = this.textareaElement?.value || '';
      
      if (value.startsWith('=')) {
        // Extract the function name being typed (after last operator or paren)
        const formulaContent = value.slice(1);
        const match = formulaContent.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
        this.query = match ? match[1] : '';
        
        // Check if we're inside a function's arguments
        const openParens = (formulaContent.match(/\(/g) || []).length;
        const closeParens = (formulaContent.match(/\)/g) || []).length;
        const insideFunction = openParens > closeParens;
        
        // Show autocomplete at start of formula or when typing function name
        if (this.query.length > 0 || formulaContent.length === 0) {
          if (!insideFunction || this.query.length > 0) {
            this.showAutocomplete();
            this.updateFilteredFunctions();
            this.renderAutocompleteList();
          }
        } else if (insideFunction) {
          this.hideAutocomplete();
        }
      } else {
        this.hideAutocomplete();
      }
    };

    this.textareaElement.addEventListener('input', inputHandler);
    
    // Store for cleanup
    (this as any)._inputHandler = inputHandler;
  }

  private filterByCategory(category: string) {
    this.updateFilteredFunctions(category === 'all' ? undefined : category);
    this.renderAutocompleteList();
  }

  private updateFilteredFunctions(category?: string) {
    let items = FORMULA_FUNCTIONS;
    
    if (category) {
      items = items.filter(f => f.category === category);
    }
    
    if (this.query) {
      const queryLower = this.query.toLowerCase();
      items = items.filter(f => 
        f.name.toLowerCase().startsWith(queryLower) ||
        f.name.toLowerCase().includes(queryLower)
      );
      
      // Sort: startsWith first, then includes
      items.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(queryLower) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(queryLower) ? 0 : 1;
        return aStarts - bStarts;
      });
    }
    
    this.filteredFunctions = items.slice(0, 15); // Limit to 15 results
    this.selectedIndex = 0;
  }

  private showAutocomplete() {
    if (!this.autocompleteContainer || !this.textareaElement) return;
    
    this.showingAutocomplete = true;
    
    // Position below the cell
    const rect = this.textareaElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // Position based on available space
    if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
      this.autocompleteContainer.style.top = `${rect.bottom + 4}px`;
    } else {
      this.autocompleteContainer.style.top = `${rect.top - 304}px`;
    }
    
    // Ensure horizontal positioning doesn't overflow
    const left = Math.min(rect.left, window.innerWidth - 330);
    this.autocompleteContainer.style.left = `${Math.max(10, left)}px`;
    
    this.autocompleteContainer.style.display = 'flex';
  }

  private hideAutocomplete() {
    if (this.autocompleteContainer) {
      this.autocompleteContainer.style.display = 'none';
    }
    this.showingAutocomplete = false;
    this.filteredFunctions = [];
    this.selectedIndex = 0;
  }

  private renderAutocompleteList() {
    if (!this.autocompleteList) return;
    
    if (this.filteredFunctions.length === 0) {
      this.autocompleteList.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;">
          ${this.query ? `No functions found for "${this.query}"` : 'Type to search formulas'}
        </div>
      `;
      return;
    }
    
    this.autocompleteList.innerHTML = '';
    
    this.filteredFunctions.forEach((func, index) => {
      const item = document.createElement('div');
      item.className = 'formula-item';
      item.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f3f4f6;
        transition: background-color 0.1s;
        ${index === this.selectedIndex ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}
      `;
      
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 600; font-size: 13px; color: ${index === this.selectedIndex ? '#1e40af' : '#1f2937'};">${func.name}</span>
          <span style="font-size: 10px; padding: 2px 6px; background: ${index === this.selectedIndex ? '#bfdbfe' : '#f3f4f6'}; border-radius: 4px; color: ${index === this.selectedIndex ? '#1e40af' : '#6b7280'};">${func.category}</span>
        </div>
        <div style="font-size: 12px; color: ${index === this.selectedIndex ? '#3b82f6' : '#6b7280'}; margin-top: 2px;">${func.description}</div>
        <div style="font-size: 11px; font-family: monospace; color: ${index === this.selectedIndex ? '#2563eb' : '#9ca3af'}; margin-top: 2px;">${func.syntax}</div>
      `;
      
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderAutocompleteList();
      });
      
      // Use mousedown instead of click - click fires AFTER mousedown,
      // and Handsontable might close the editor (removing this element) before click fires
      item.addEventListener('mousedown', (e) => {
        console.log('[FormulaEditor] Autocomplete item mousedown:', func.name);
        e.preventDefault();
        e.stopPropagation();
        this.selectFunction(func);
      });
      
      this.autocompleteList!.appendChild(item);
    });
    
    // Scroll selected item into view
    const selectedItem = this.autocompleteList.children[this.selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  private selectFunction(func: FormulaFunction) {
    console.log('[FormulaEditor] selectFunction called:', func.name);
    
    const textarea = this.textareaElement;
    if (!textarea) {
      console.warn('[FormulaEditor] No textarea element!');
      return;
    }
    
    const currentValue = textarea.value;
    let newValue: string;
    
    if (currentValue === '=' || currentValue === '') {
      // Start of formula
      newValue = `=${func.name}(`;
    } else {
      // Replace the query with the function name
      const beforeQuery = currentValue.slice(0, currentValue.length - this.query.length);
      newValue = `${beforeQuery}${func.name}(`;
    }
    
    console.log('[FormulaEditor] Setting value:', { currentValue, newValue, query: this.query });
    
    // Hide autocomplete first
    this.hideAutocomplete();
    
    // Update the textarea value directly
    textarea.value = newValue;
    
    // CRITICAL: Focus must happen before setSelectionRange
    textarea.focus();
    
    // Position cursor after opening parenthesis
    const cursorPos = newValue.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
    
    // Trigger input event to update any listeners
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Reset query
    this.query = '';
    
    console.log('[FormulaEditor] Value after setting:', textarea.value);
  }

  // Override onBeforeKeyDown to handle autocomplete navigation
  onBeforeKeyDown(event: KeyboardEvent) {
    if (this.showingAutocomplete && this.filteredFunctions.length > 0) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this.selectedIndex = (this.selectedIndex + 1) % this.filteredFunctions.length;
          this.renderAutocompleteList();
          return;
          
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this.selectedIndex = (this.selectedIndex - 1 + this.filteredFunctions.length) % this.filteredFunctions.length;
          this.renderAutocompleteList();
          return;
          
        case 'Enter':
        case 'Tab':
          if (this.filteredFunctions[this.selectedIndex]) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.selectFunction(this.filteredFunctions[this.selectedIndex]);
            return;
          }
          break;
          
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          this.hideAutocomplete();
          return;
      }
    }
    
    // Let other keys pass through to default behavior
  }
}

// Register the custom editor
Handsontable.editors.registerEditor('formula', FormulaEditor);

export default FormulaEditor;

