/**
 * YtDlpScraper - Server-side yt-dlp video extraction via Python backend
 *
 * Flow:
 * 1. Call runPluginOperation for extract_metadata (runs inline, result returned directly).
 *    Stash runs jobs one at a time, so a task would wait behind any running download.
 * 2. If the request itself fails (e.g. a reverse proxy cuts a long request), fall back to
 *    the task path: runPluginTask saves to a temp file, read_result reads it, cleanup.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- yt-dlp JSON output has dynamic structure */

import type { IMetadataScraper, IScrapedMetadata } from '@/types';
import { ContentType } from '@/types';
import { getStashService } from '@/services/stash/StashGraphQLService';
import { createConcurrencyLimiter, createLogger } from '@/utils';
import { PLUGIN_ID, STORAGE_KEYS } from '@/constants';

const log = createLogger('YtDlpScraper');

// Operations aren't serialized by Stash, so cap concurrent yt-dlp processes
// (batch-adding many URLs would otherwise spawn one per URL)
const extractionLimit = createConcurrencyLimiter(3);

export class YtDlpScraper implements IMetadataScraper {
  name = 'yt-dlp';
  supportedDomains = ['*']; // Supports all domains
  contentTypes = [ContentType.Video]; // Primarily for video extraction
  private readonly timeoutMs = 60000; // 60 seconds for yt-dlp (proxy connections can be slow)

  canHandle(url: string): boolean {
    // Can handle any URL if yt-dlp is available
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async scrape(url: string): Promise<IScrapedMetadata> {
    log.debug('Using server-side yt-dlp to extract:', url);
    return this.scrapeServerSide(url);
  }

  /**
   * Generate a unique result ID for tracking async results
   */
  private generateResultId(): string {
    return `ytdlp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Read proxy and custom yt-dlp path from saved settings
   */
  private getSettings(): { proxy?: string; ytdlpPath?: string } {
    if (typeof window === 'undefined') return {};
    const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!settings) return {};
    try {
      const parsed = JSON.parse(settings);
      return { proxy: parsed.httpProxy, ytdlpPath: parsed.ytdlpPath };
    } catch {
      // Ignore parse errors
      return {};
    }
  }

  /**
   * Server-side extraction using Python backend via runPluginOperation
   */
  private async scrapeServerSide(url: string): Promise<IScrapedMetadata> {
    const stashService = getStashService();
    const { proxy, ytdlpPath } = this.getSettings();

    // Log configuration for troubleshooting
    if (proxy) {
      log.debug(`Using HTTP proxy for metadata extraction: ${proxy}`);
    } else {
      log.debug('No HTTP proxy configured - using direct connection');
    }
    if (ytdlpPath) {
      log.debug(`Using custom yt-dlp path: ${ytdlpPath}`);
    }

    // No result_id: Python returns the result directly and writes no temp file.
    // No request timeout: Python bounds extraction itself (yt-dlp/page fetch timeouts).
    const op = await extractionLimit(() =>
      stashService.runPluginOperationWithError(PLUGIN_ID, {
        mode: 'extract_metadata',
        url: url,
        proxy: proxy, // Pass proxy if configured
        ytdlp_path: ytdlpPath, // Pass custom yt-dlp path if configured
      })
    );

    let readResult: any;
    if (op.error) {
      // Python result_error (e.g. yt-dlp's message), surfaced as the GraphQL error
      log.error(`yt-dlp extraction failed: ${op.error}`);
      throw new Error(op.error);
    } else if (op.transportError) {
      log.warn('Extraction request failed, falling back to plugin task');
      readResult = await this.extractViaTask(url, proxy, ytdlpPath);
    } else {
      if (!op.data) {
        throw new Error('runPluginOperation returned null - check Stash server logs');
      }
      readResult = op.data;
    }

    return this.parseResult(url, readResult);
  }

  /**
   * Fallback extraction as a Stash job (queued behind other jobs).
   * Uses file-based result passing:
   * 1. runPluginTask extracts metadata and saves to temp file
   * 2. runPluginOperation reads the result from temp file
   */
  private async extractViaTask(url: string, proxy?: string, ytdlpPath?: string): Promise<any> {
    const stashService = getStashService();
    const resultId = this.generateResultId();

    log.debug('Starting task-based extraction with result_id:', resultId);

    let taskResult: { success: boolean; error?: string; jobId?: string };

    // Step 1: Run extract_metadata task (saves result to temp file)
    try {
      log.debug('Calling runPluginTaskAndWait...');

      // Check if Stash is busy with long-running tasks (Scan, Generate) that could block us
      // Note: Our own plugin jobs queueing is expected and not a concern
      const runningJobs = await stashService.getRunningJobs();
      const blockingJobs = runningJobs.filter(job =>
        !job.includes('Extract Metadata') &&
        !job.includes('Download Video') &&
        !job.includes('Cleanup Result') &&
        !job.toLowerCase().includes('stash-downloader')
      );
      if (blockingJobs.length > 0) {
        log.warn(`⚠️ Stash is busy: ${blockingJobs.join(', ')} - this may cause timeouts`);
      }

      taskResult = await stashService.runPluginTaskAndWait(
        PLUGIN_ID,
        'Extract Metadata',
        {
          mode: 'extract_metadata',
          url: url,
          result_id: resultId,
          proxy: proxy, // Pass proxy if configured
          ytdlp_path: ytdlpPath, // Pass custom yt-dlp path if configured
        },
        {
          maxWaitMs: this.timeoutMs,
          onProgress: (progress) => {
            log.debug(`Extraction progress: ${progress}%`);
          },
        }
      );
      log.debug('runPluginTaskAndWait returned:', JSON.stringify(taskResult));
    } catch (taskError) {
      log.error(`runPluginTaskAndWait threw error: ${String(taskError)}`);
      throw taskError;
    }

    if (!taskResult.success) {
      throw new Error(`yt-dlp extraction task failed: ${taskResult.error || 'Unknown error'}`);
    }

    // Step 2: Read the result from temp file
    log.debug('Task succeeded, reading result...');
    let readResult: any;
    try {
      const operationResult = await stashService.runPluginOperation(PLUGIN_ID, {
        mode: 'read_result',
        result_id: resultId,
      });
      log.debug('runPluginOperation returned:', JSON.stringify(operationResult, null, 2));

      if (!operationResult) {
        throw new Error('runPluginOperation returned null - check Stash server logs');
      }

      // Check if operationResult has an 'error' field (from PluginOutput.error)
      if (operationResult.error) {
        log.error('Python script returned error:', operationResult.error);
        throw new Error(`Python script error: ${operationResult.error}`);
      }

      // The result is already the extracted data from PluginOutput.output
      readResult = operationResult;
      log.debug('Successfully read result:', JSON.stringify(readResult, null, 2));
    } catch (readError) {
      log.error(`Read result error: ${String(readError)}`);
      throw readError;
    }

    // Step 3: Cleanup (fire and forget)
    stashService.runPluginTask(PLUGIN_ID, 'Cleanup Result', {
      mode: 'cleanup_result',
      result_id: resultId,
    }).catch((cleanupErr) => {
      log.warn('Cleanup error (ignored):', String(cleanupErr));
    });

    return readResult;
  }

  /**
   * Convert the extract_metadata result to our metadata format
   */
  private parseResult(url: string, readResult: any): IScrapedMetadata {
    log.debug('Parsing result data...');

    // Check for error in result FIRST (this contains the actual error message)
    if (readResult.result_error || readResult.error) {
      const errorMsg = readResult.result_error || readResult.error;
      log.error(`yt-dlp extraction failed: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Check success flag
    if (readResult.success === false || (readResult.success === undefined && !readResult.title)) {
      log.error('Result missing success flag or failed:', JSON.stringify(readResult));
      throw new Error('yt-dlp extraction failed - no metadata returned');
    }

    log.debug('Got metadata from server-side yt-dlp:', readResult.title);

    // Extract video URL and available qualities from the result
    let videoUrl: string | undefined;
    let quality: string | undefined;
    let availableQualities: string[] = [];

    if (readResult.formats && Array.isArray(readResult.formats) && readResult.formats.length > 0) {
      // Extract all unique video heights (qualities)
      const heights = new Set<number>();
      for (const format of readResult.formats) {
        if (format.height && format.height > 0 && (format.vcodec !== 'none' || format.acodec !== 'none')) {
          heights.add(format.height);
        }
      }

      // Sort heights descending and format as quality strings
      availableQualities = Array.from(heights)
        .sort((a, b) => b - a)
        .map(h => `${h}p`);

      log.debug(`Available qualities: ${availableQualities.join(', ')}`);

      // Sort by height descending to get best quality first
      const sortedFormats = [...readResult.formats].sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      for (const format of sortedFormats) {
        if (format.url || format.manifest_url) {
          videoUrl = format.url || format.manifest_url;
          quality = format.height ? `${format.height}p` : undefined;
          log.debug(`Selected format: ${quality || 'unknown'} from ${sortedFormats.length} formats`);
          break;
        }
      }
    }

    // Fall back to top-level URL if no format URL found
    if (!videoUrl && readResult.url) {
      videoUrl = readResult.url;
      quality = readResult.height ? `${readResult.height}p` : undefined;
      if (quality && availableQualities.length === 0) {
        availableQualities = [quality];
      }
      log.debug('Using top-level URL');
    }

    if (videoUrl) {
      log.debug(`Video URL extracted: ${videoUrl.substring(0, 100)}...`);
    } else {
      log.debug('No video URL found in result');
    }

    // Convert to our metadata format
    const tags = readResult.tags || readResult.categories || [];
    const performers = this.extractPerformers(readResult);

    return {
      url: url,
      videoUrl: videoUrl,
      title: readResult.title || undefined,
      description: readResult.description || undefined,
      date: readResult.upload_date ? this.formatDate(readResult.upload_date) : undefined,
      duration: readResult.duration || undefined,
      thumbnailUrl: readResult.thumbnail || undefined,
      performers: performers,
      tags: tags,
      studio: readResult.uploader || readResult.channel || undefined,
      quality: quality,
      availableQualities: availableQualities.length > 0 ? availableQualities : undefined,
      contentType: 'video' as ContentType,
    };
  }

  /**
   * Format yt-dlp date (YYYYMMDD) to YYYY-MM-DD
   */
  private formatDate(dateStr: string): string {
    if (dateStr.length === 8) {
      return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }
    return dateStr;
  }

  /**
   * Extract performers from yt-dlp metadata
   */
  private extractPerformers(ytdlp: any): string[] {
    const performers: string[] = [];

    // Try cast first (common for adult sites like Pornhub)
    if (ytdlp.cast && Array.isArray(ytdlp.cast)) {
      performers.push(...ytdlp.cast);
    }

    // Try creators
    if (ytdlp.creators && Array.isArray(ytdlp.creators)) {
      performers.push(...ytdlp.creators);
    }

    // Try actors
    if (ytdlp.actors && Array.isArray(ytdlp.actors)) {
      performers.push(...ytdlp.actors);
    }

    // Try artist (music videos)
    if (ytdlp.artist && typeof ytdlp.artist === 'string') {
      performers.push(ytdlp.artist);
    }

    // Fallback to uploader if no performers found
    if (performers.length === 0 && ytdlp.uploader) {
      performers.push(ytdlp.uploader);
    }

    // Deduplicate
    return [...new Set(performers)];
  }
}
