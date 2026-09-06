import type {
  FindInPageBackend,
  FindInPageResult,
} from './find-in-page-backend';

const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'OBJECT',
  'CANVAS',
  'INPUT',
  'TEXTAREA',
]);

export class BrowserFindInPageBackend implements FindInPageBackend {
  private matches: Range[] = [];
  private activeOrdinal = 0;
  private lastText = '';

  private getSearchRoot(): HTMLElement {
    return (
      (document.querySelector(
        'affine-editor-container'
      ) as HTMLElement | null) ||
      (document.querySelector(
        '[data-testid="main-container"]'
      ) as HTMLElement | null) ||
      document.body
    );
  }

  private collectMatches(text: string): Range[] {
    if (!text || typeof document === 'undefined') {
      return [];
    }

    const root = this.getSearchRoot();
    const ranges: Range[] = [];
    const lowerSearch = text.toLowerCase();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        if (EXCLUDED_TAGS.has(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          parent.closest('[data-find-in-page-anchor]') ||
          parent.closest('[data-radix-popper-content-wrapper]') ||
          parent.closest('.find-in-page-popup')
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        const textContent = node.nodeValue;
        if (!textContent || textContent.trim().length === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let currentNode = walker.nextNode();
    while (currentNode) {
      const content = currentNode.nodeValue || '';
      const lowerContent = content.toLowerCase();
      let index = 0;

      while ((index = lowerContent.indexOf(lowerSearch, index)) !== -1) {
        try {
          const range = new Range();
          range.setStart(currentNode, index);
          range.setEnd(currentNode, index + text.length);
          ranges.push(range);
        } catch {
          // ignore any invalid DOM range creation
        }
        index += text.length;
      }

      currentNode = walker.nextNode();
    }

    return ranges;
  }

  private updateHighlights() {
    if (
      typeof CSS !== 'undefined' &&
      'highlights' in CSS &&
      typeof Highlight !== 'undefined'
    ) {
      if (this.matches.length === 0) {
        CSS.highlights.delete('find-in-page-highlight');
        CSS.highlights.delete('find-in-page-active-highlight');
        return;
      }

      const activeIndex = this.activeOrdinal - 1;
      const activeRange = this.matches[activeIndex];
      const inactiveRanges = this.matches.filter(
        (_, idx) => idx !== activeIndex
      );

      if (inactiveRanges.length > 0) {
        CSS.highlights.set(
          'find-in-page-highlight',
          new Highlight(...inactiveRanges)
        );
      } else {
        CSS.highlights.delete('find-in-page-highlight');
      }

      if (activeRange) {
        CSS.highlights.set(
          'find-in-page-active-highlight',
          new Highlight(activeRange)
        );
      } else {
        CSS.highlights.delete('find-in-page-active-highlight');
      }
    }

    if (this.matches.length > 0 && this.activeOrdinal > 0) {
      const activeRange = this.matches[this.activeOrdinal - 1];
      if (activeRange) {
        const targetElement =
          activeRange.startContainer instanceof Element
            ? activeRange.startContainer
            : activeRange.startContainer.parentElement;

        targetElement?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }
    }
  }

  async find(
    text: string,
    options?: { forward?: boolean; findNext?: boolean }
  ): Promise<FindInPageResult | null> {
    const trimmed = text.trim();
    if (!trimmed) {
      this.clear();
      return null;
    }

    const isNewSearch = text !== this.lastText || !options?.findNext;

    if (isNewSearch) {
      this.matches = this.collectMatches(text);
      this.lastText = text;
      if (this.matches.length === 0) {
        this.activeOrdinal = 0;
        this.updateHighlights();
        return { matches: 0, activeMatchOrdinal: 0 };
      }
      this.activeOrdinal = 1;
    } else {
      if (this.matches.length === 0) {
        return { matches: 0, activeMatchOrdinal: 0 };
      }
      if (options?.forward !== false) {
        this.activeOrdinal = (this.activeOrdinal % this.matches.length) + 1;
      } else {
        this.activeOrdinal =
          this.activeOrdinal <= 1
            ? this.matches.length
            : this.activeOrdinal - 1;
      }
    }

    this.updateHighlights();
    return {
      matches: this.matches.length,
      activeMatchOrdinal: this.activeOrdinal,
    };
  }

  clear(): void {
    this.matches = [];
    this.activeOrdinal = 0;
    this.lastText = '';

    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      CSS.highlights.delete('find-in-page-highlight');
      CSS.highlights.delete('find-in-page-active-highlight');
    }
  }
}
