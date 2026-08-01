import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RAGPanel } from '../RAGPanel';
import { vectorDb } from '../../utils/vectorDb';

vi.mock('../../utils/vectorDb', () => ({
  vectorDb: {
    getDocuments: vi.fn().mockResolvedValue([]),
    onStatusChange: vi.fn().mockReturnValue(() => {}),
    subscribeStatus: vi.fn().mockReturnValue(() => {}),
    subscribeProgress: vi.fn().mockReturnValue(() => {}),
    preloadModel: vi.fn(),
    addDocument: vi.fn().mockResolvedValue('doc-1'),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    clearIndex: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('RAGPanel Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    isRagEnabled: true,
    onToggleRag: vi.fn(),
    onError: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<RAGPanel {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true and loads document list', async () => {
    render(<RAGPanel {...defaultProps} />);

    expect(screen.getByText('Local Semantic Memory (RAG)')).toBeDefined();
    await waitFor(() => {
      expect(vectorDb.getDocuments).toHaveBeenCalled();
    });
  });

  it('calls onToggleRag when toggle button is clicked', () => {
    render(<RAGPanel {...defaultProps} />);

    const toggleBtn = screen.getByRole('switch');
    fireEvent.click(toggleBtn);

    expect(defaultProps.onToggleRag).toHaveBeenCalledWith(false);
  });

  it('validates invalid URL format on web index submit', async () => {
    render(<RAGPanel {...defaultProps} />);

    const urlInput = screen.getByPlaceholderText('https://example.com/documentation');
    fireEvent.change(urlInput, { target: { value: 'not-a-valid-url' } });

    const submitBtn = screen.getByText('Index URL');
    fireEvent.click(submitBtn);

    expect(defaultProps.onError).toHaveBeenCalledWith('Please enter a valid absolute URL (including http:// or https://).');
  });
});
