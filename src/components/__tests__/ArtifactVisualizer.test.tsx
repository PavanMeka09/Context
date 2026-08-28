import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactVisualizer } from '../ArtifactVisualizer';

describe('ArtifactVisualizer Component', () => {
  const sampleArtifact = {
    language: 'javascript',
    code: 'console.log("Hello Artifact");',
    title: 'Sample Script',
  };

  it('renders code mode by default for code artifacts', () => {
    render(<ArtifactVisualizer artifact={sampleArtifact} />);
    expect(screen.getByText('javascript')).toBeDefined();
    expect(screen.getByText('Sample Script')).toBeDefined();
    expect(screen.getByText('console.log("Hello Artifact");')).toBeDefined();
  });

  it('allows switching between Code and Live Canvas view modes', () => {
    render(<ArtifactVisualizer artifact={sampleArtifact} />);
    const canvasBtn = screen.getByTitle('Live Canvas / HTML Preview');
    fireEvent.click(canvasBtn);
    expect(screen.getByTitle('Sample Script')).toBeDefined();

    const codeBtn = screen.getByTitle('Source Code View');
    fireEvent.click(codeBtn);
    expect(screen.getByText('console.log("Hello Artifact");')).toBeDefined();
  });

  it('automatically defaults to preview mode for HTML/SVG artifacts', () => {
    const htmlArtifact = {
      language: 'html',
      code: '<h1>Interactive Header</h1>',
      title: 'HTML Page',
    };
    render(<ArtifactVisualizer artifact={htmlArtifact} />);
    expect(screen.getByTitle('HTML Page')).toBeDefined();
  });

  it('renders interactive chart visualizer tab for JSON/CSV datasets', () => {
    const jsonArtifact = {
      language: 'json',
      code: '[{"name": "Jan", "sales": 100}, {"name": "Feb", "sales": 250}]',
      title: 'Sales Data',
    };
    render(<ArtifactVisualizer artifact={jsonArtifact} />);
    const chartTab = screen.getByTitle('Interactive Chart Visualizer');
    expect(chartTab).toBeDefined();
    fireEvent.click(chartTab);

    expect(screen.getByText('Interactive Data Visualizer')).toBeDefined();
    expect(screen.getByText('Jan')).toBeDefined();
    expect(screen.getByText('250')).toBeDefined();
  });

  it('runs JavaScript code in sandbox and displays terminal output', async () => {
    render(<ArtifactVisualizer artifact={sampleArtifact} />);
    const runBtn = screen.getByTitle('Run Code in Sandbox');
    fireEvent.click(runBtn);

    expect(await screen.findByText('Sandbox Terminal Output')).toBeDefined();
    expect(screen.getByText('Hello Artifact')).toBeDefined();
  });

  it('renders iframe with enhanced sandbox permissions and responsive srcDoc for embeds', () => {
    const iframeSnippet = {
      language: 'html',
      code: '<iframe src="https://www.youtube.com/embed/zzaj4ucQc8U"></iframe>',
      title: 'YouTube Embed',
    };
    render(<ArtifactVisualizer artifact={iframeSnippet} />);
    const iframe = screen.getByTitle('YouTube Embed') as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).toContain('allow-presentation');
    expect(iframe.getAttribute('allow')).toContain('accelerometer');
    expect(iframe.getAttribute('srcdoc')).toContain('max-width: 100%');
  });
});
