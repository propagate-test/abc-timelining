import { fetchDocsPageContent } from '@/services/docs/client';
import {
  markPageVectoriseSkipped,
  markPageVectorised,
  upsertPageChunks,
} from '@/services/vectorise/page/neo4j';
import { vectorisePageStage } from '@/services/vectorise/page/stage';
import { chunkText } from '@/services/vectorise/shared/chunk';
import { embedTexts } from '@/services/vectorise/shared/embed';

jest.mock('@/services/docs/client', () => ({
  fetchDocsPageContent: jest.fn(),
}));

jest.mock('@/services/docs/snapshotCache', () => ({
  syncDocsPageMetadataFromSnapshot: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/vectorise/page/neo4j', () => ({
  markPageVectoriseSkipped: jest.fn(),
  markPageVectorised: jest.fn(),
  upsertPageChunks: jest.fn(),
}));

jest.mock('@/services/vectorise/shared/chunk', () => ({
  chunkText: jest.fn(),
}));

jest.mock('@/services/vectorise/shared/embed', () => ({
  embedTexts: jest.fn(),
}));

const mockedFetch = fetchDocsPageContent as jest.MockedFunction<typeof fetchDocsPageContent>;
const mockedMarkSkipped = markPageVectoriseSkipped as jest.MockedFunction<
  typeof markPageVectoriseSkipped
>;
const mockedMark = markPageVectorised as jest.MockedFunction<typeof markPageVectorised>;
const mockedUpsert = upsertPageChunks as jest.MockedFunction<typeof upsertPageChunks>;
const mockedChunk = chunkText as jest.MockedFunction<typeof chunkText>;
const mockedEmbed = embedTexts as jest.MockedFunction<typeof embedTexts>;

describe('vectorisePageStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips image-only markdown as empty', async () => {
    mockedFetch.mockResolvedValue('![slide](./assets/slide-1.png)');

    const result = await vectorisePageStage('en/some-visual');

    expect(result).toBe('skipped');
    expect(mockedMarkSkipped).toHaveBeenCalledWith('en/some-visual', 'empty');
    expect(mockedChunk).not.toHaveBeenCalled();
  });

  it('skips with skipped status when docs returns 404', async () => {
    mockedFetch.mockResolvedValue(null);

    const result = await vectorisePageStage('en/missing-page');

    expect(result).toBe('skipped');
    expect(mockedMarkSkipped).toHaveBeenCalledWith('en/missing-page', 'not_found');
    expect(mockedMark).not.toHaveBeenCalled();
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it('skips with skipped status when content is empty', async () => {
    mockedFetch.mockResolvedValue('   \n  ');

    const result = await vectorisePageStage('en/empty-page');

    expect(result).toBe('skipped');
    expect(mockedMarkSkipped).toHaveBeenCalledWith('en/empty-page', 'empty');
    expect(mockedMark).not.toHaveBeenCalled();
    expect(mockedChunk).not.toHaveBeenCalled();
  });

  it('skips with skipped status when chunking yields no chunks', async () => {
    mockedFetch.mockResolvedValue('some content with enough words');
    mockedChunk.mockResolvedValue([]);

    const result = await vectorisePageStage('en/no-chunks');

    expect(result).toBe('skipped');
    expect(mockedMarkSkipped).toHaveBeenCalledWith('en/no-chunks', 'no_chunks');
    expect(mockedMark).not.toHaveBeenCalled();
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it('vectorises when content and chunks are present', async () => {
    mockedFetch.mockResolvedValue('Hello world with enough words');
    mockedChunk.mockResolvedValue(['Hello world with enough words']);
    mockedEmbed.mockResolvedValue([[0.1, 0.2]]);

    const result = await vectorisePageStage('en/real-page');

    expect(result).toBe('vectorised');
    expect(mockedUpsert).toHaveBeenCalled();
    expect(mockedMark).toHaveBeenCalledWith('en/real-page');
  });

  it('returns failed on unexpected fetch errors', async () => {
    mockedFetch.mockRejectedValue(new Error('serve failed for en/broken: 500'));

    const result = await vectorisePageStage('en/broken');

    expect(result).toBe('failed');
    expect(mockedMark).not.toHaveBeenCalled();
    expect(mockedMarkSkipped).not.toHaveBeenCalled();
  });
});
