import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ImageModal } from '../ImageModal';

describe('ImageModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    isOpen: true,
    src: 'https://example.com/test-image.png',
    alt: 'Test Alt Description',
    title: 'Test Image Title',
    onClose: vi.fn()
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ImageModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders image, title, and alt when isOpen is true', () => {
    render(<ImageModal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Test Image Title')).toBeDefined();
    expect(screen.getByText('Test Alt Description')).toBeDefined();

    const img = screen.getByAltText('Test Alt Description') as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toBe('https://example.com/test-image.png');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ImageModal {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByLabelText('Close image modal');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ImageModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('zooms in and out using toolbar buttons and updates zoom indicator', () => {
    render(<ImageModal {...defaultProps} />);

    expect(screen.getByText('100%')).toBeDefined();

    const zoomInBtn = screen.getByLabelText('Zoom in');
    const zoomOutBtn = screen.getByLabelText('Zoom out');

    fireEvent.click(zoomInBtn);
    expect(screen.getByText('125%')).toBeDefined();

    fireEvent.click(zoomInBtn);
    expect(screen.getByText('150%')).toBeDefined();

    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('125%')).toBeDefined();

    // Reset zoom button
    const resetBtn = screen.getByLabelText('Reset zoom');
    fireEvent.click(resetBtn);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('zooms in and out using keyboard shortcuts (+, -, 0)', () => {
    render(<ImageModal {...defaultProps} />);

    expect(screen.getByText('100%')).toBeDefined();

    fireEvent.keyDown(window, { key: '+' });
    expect(screen.getByText('125%')).toBeDefined();

    fireEvent.keyDown(window, { key: '-' });
    expect(screen.getByText('100%')).toBeDefined();

    fireEvent.keyDown(window, { key: '+' });
    fireEvent.keyDown(window, { key: '+' });
    expect(screen.getByText('150%')).toBeDefined();

    fireEvent.keyDown(window, { key: '0' });
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('toggles zoom on double clicking the image', () => {
    render(<ImageModal {...defaultProps} />);

    const img = screen.getByAltText('Test Alt Description');
    expect(screen.getByText('100%')).toBeDefined();

    fireEvent.doubleClick(img);
    expect(screen.getByText('200%')).toBeDefined();

    fireEvent.doubleClick(img);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('copies image url to clipboard and shows Copied! feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true
    });

    render(<ImageModal {...defaultProps} />);

    const copyBtn = screen.getByLabelText('Copy image');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith('https://example.com/test-image.png');
    expect(screen.getByText('Copied!')).toBeDefined();
  });

  it('handles download button click', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ImageModal {...defaultProps} />);

    const downloadBtn = screen.getByLabelText('Download image');
    fireEvent.click(downloadBtn);

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('displays error message when image fails to load', () => {
    render(<ImageModal {...defaultProps} />);

    const img = screen.getByAltText('Test Alt Description');
    fireEvent.error(img);

    expect(screen.getByText('Unable to load image')).toBeDefined();
  });

  it('renders correctly when image object is passed via image prop', () => {
    render(
      <ImageModal
        isOpen={true}
        image={{
          src: 'https://example.com/item.png',
          alt: 'Item Alt',
          title: 'Item Title'
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Item Title')).toBeDefined();
    expect(screen.getByText('Item Alt')).toBeDefined();
  });
});
