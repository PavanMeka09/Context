import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MarkdownRenderer } from '../MarkdownRenderer';

describe('MarkdownRenderer Component', () => {
  it('renders plain markdown text and headers', () => {
    render(
      <MarkdownRenderer
        content={`# Hello World
This is a test paragraph.`}
      />
    );

    expect(screen.getByText('Hello World')).toBeDefined();
    expect(screen.getByText('This is a test paragraph.')).toBeDefined();
  });

  it('renders code blocks with copy button', () => {
    render(
      <MarkdownRenderer
        content={`\`\`\`js
console.log('test');
\`\`\``}
      />
    );

    expect(screen.getByText('JS')).toBeDefined();
    expect(screen.getByLabelText('Copy code to clipboard')).toBeDefined();
  });

  it('copies code when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true
    });

    render(
      <MarkdownRenderer
        content={`\`\`\`python
print('hello')
\`\`\``}
      />
    );

    const copyBtn = screen.getByLabelText('Copy code to clipboard');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith("print('hello')");
  });
});
