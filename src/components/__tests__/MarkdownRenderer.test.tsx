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

  it('opens enlarged ImageModal when clicking on a markdown image', () => {
    render(
      <MarkdownRenderer
        content={`Here is an image: ![Sample Diagram](https://example.com/diagram.png)`}
      />
    );

    const img = screen.getByAltText('Sample Diagram');
    expect(img).toBeDefined();

    // Modal is initially not present
    expect(screen.queryByRole('dialog')).toBeNull();

    // Click on the image
    fireEvent.click(img);

    // Modal should now be open displaying enlarged view
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByLabelText('Sample Diagram')).toBeDefined();
  });

  it('triggers onOpenImagePreview when Enter key is pressed on focused markdown image', () => {
    const onOpenImagePreview = vi.fn();
    render(
      <MarkdownRenderer
        content={`![Accessible Chart](https://example.com/chart.png)`}
        onOpenImagePreview={onOpenImagePreview}
      />
    );

    const img = screen.getByAltText('Accessible Chart');
    expect(img.getAttribute('tabindex')).toBe('0');
    expect(img.getAttribute('role')).toBe('button');

    fireEvent.keyDown(img, { key: 'Enter' });

    expect(onOpenImagePreview).toHaveBeenCalledWith({
      src: 'https://example.com/chart.png',
      alt: 'Accessible Chart',
      title: 'Image'
    });
  });
});


