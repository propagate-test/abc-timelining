/** Strip markdown images, video embeds, and HTML media so we can detect text-only bodies. */
function stripMediaFromMarkdown(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<video[\s\S]*?<\/video>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<source[^>]*>/gi, '')
    .replace(/\[([^\]]*)\]\([^)]*\.(?:mp4|webm|mov|ogg|m4v)[^)]*\)/gi, '')
    .replace(/\[([^\]]*)\]\([^)]*(?:youtube\.com|youtu\.be|vimeo\.com)[^)]*\)/gi, '');
}

/** True when the page has prose left after removing images and video (not media-only). */
export function hasVectorisableText(content: string): boolean {
  const withoutMedia = stripMediaFromMarkdown(content);

  const lines = withoutMedia
    .split('\n')
    .filter((line) => !/^#{1,6}\s/.test(line.trim()))
    .map((line) =>
      line
        .replace(/<[^>]+>/g, '')
        .replace(/[#>*_~`-]/g, '')
        .trim()
    );

  const words = lines
    .filter((line) => line.length > 0)
    .join(' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);

  return words.length > 0;
}
