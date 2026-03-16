'use client';

import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import NoteMentionList, { type MentionItem } from './NoteMentionList';

/**
 * Creates a TipTap mention suggestion config.
 * Takes a data source function that returns all mentionable items.
 * The function is called each time the @ popup appears.
 */
export function getMentionSuggestion(
  getItems: () => MentionItem[]
) {
  return {
    items: ({ query }: { query: string }) => {
      const allItems = getItems();
      if (!query) return allItems.slice(0, 10);

      const q = query.toLowerCase();
      return allItems
        .filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q)
        )
        .slice(0, 10);
    },

    render: () => {
      let component: ReactRenderer;
      let popup: any;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(NoteMentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          });
        },

        onUpdate(props: any) {
          component.updateProps(props);

          if (!props.clientRect) return;

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props: any) {
          if (props.event.key === 'Escape') {
            popup[0].hide();
            return true;
          }

          if (
            component.ref &&
            typeof (component.ref as any).onKeyDown === 'function'
          ) {
            return (component.ref as any).onKeyDown(props);
          }
          return false;
        },

        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };
}
