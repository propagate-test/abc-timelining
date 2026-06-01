import { hasVectorisableText } from '@/services/vectorise/page/content';

describe('hasVectorisableText', () => {
  it('returns false for image-only markdown', () => {
    expect(hasVectorisableText('![slide](./slide.png)')).toBe(false);
    expect(hasVectorisableText('# Title\n\n![a](a.png)\n![b](b.png)')).toBe(false);
  });

  it('returns false for video-only markdown', () => {
    expect(hasVectorisableText('<video src="clip.mp4"></video>')).toBe(false);
    expect(hasVectorisableText('[watch](https://www.youtube.com/watch?v=abc)')).toBe(false);
    expect(hasVectorisableText('![demo](./clip.webm)')).toBe(false);
  });

  it('returns true when prose remains after media is stripped', () => {
    expect(hasVectorisableText('# Hello\n\nSome narrative text.')).toBe(true);
    expect(
      hasVectorisableText('![slide](./slide.png)\n\nParagraph with real content here.')
    ).toBe(true);
  });
});
