import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../core/logger.js';
import { existsSync } from 'fs';
import { InnerTubeClient } from './innertube.js';

const execAsync = promisify(exec);

export class StreamExtractor {
  constructor(config) {
    this.config = config;
    this.innerTube = new InnerTubeClient(config);
    this.ytdlpPath = this.findYtDlp();
    this.preferInnerTube = true; // Use InnerTube by default (faster)
  }
  
  findYtDlp() {
    if (existsSync('./yt-dlp.exe')) return './yt-dlp.exe';
    if (existsSync('./yt-dlp')) return './yt-dlp';
    return this.config.ytdlpPath || 'yt-dlp';
  }
  
  /**
   * Extract video with InnerTube (primary method)
   */
  async extract(videoId) {
    // Try InnerTube first (faster)
    if (this.preferInnerTube) {
      try {
        const result = await this.extractWithInnerTube(videoId);
        if (result.success) {
          return result;
        }
        logger.warn(`InnerTube failed for ${videoId}: ${result.error}`);
      } catch (error) {
        logger.error(`InnerTube error for ${videoId}: ${error.message}`);
      }
    }
    
    // Return error instead of trying yt-dlp (which isn't installed)
    return {
      success: false,
      error: 'Video extraction failed. InnerTube could not get stream URL.',
      fallback: true,
      message: 'Try a different video or check server logs for details.'
    };
  }
  
  /**
   * Extract with InnerTube (FAST - ~500ms)
   *
   * Returns adaptive video+audio tracks separately when available (required for
   * 1080p+), or a single combined streamUrl for lower qualities.
   */
  async extractWithInnerTube(videoId) {
    const startTime = Date.now();
    
    try {
      const info = await this.innerTube.getVideoInfo(videoId);
      
      if (!info.success) {
        logger.error(`InnerTube getVideoInfo failed: ${info.error}`);
        return { success: false, error: info.error, fallback: true };
      }

      const formats = info.formats;

      // ── Adaptive path (1080p+) ──────────────────────────────────────────
      // YouTube only provides 1080p as separate video-only + audio-only streams.
      // Pick the best video track up to 1080p (prefer h264 for broad support),
      // then the best audio track.
      const videoFormats = formats
        .filter(f => f.hasVideo && !f.hasAudio && f.url)
        .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));

      const audioFormats = formats
        .filter(f => !f.hasVideo && f.hasAudio && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      // Prefer h264 video (mp4) for browser compatibility; fall back to vp9/av1
      const bestVideo = videoFormats.find(f => f.codecs?.startsWith('avc1')) || videoFormats[0];
      const bestAudio = audioFormats.find(f => f.mimeType?.includes('mp4')) || audioFormats[0];

      const duration = Date.now() - startTime;

      if (bestVideo?.url && bestAudio?.url) {
        const quality = bestVideo.qualityLabel || `${bestVideo.height}p`;
        logger.info(`Adaptive: video=${quality} (${bestVideo.codecs}) audio=${bestAudio.audioQuality}`);
        logger.info(`InnerTube extracted ${videoId} in ${duration}ms`);

        return {
          success: true,
          adaptive: true,             // tells the player to use MediaSource
          method: 'innertube',
          title: info.title,
          author: info.author,
          duration: info.lengthSeconds,
          viewCount: info.viewCount,
          thumbnail: info.thumbnail,
          videoUrl: bestVideo.url,
          audioUrl: bestAudio.url,
          videoMimeType: `${bestVideo.mimeType}; codecs="${bestVideo.codecs}"`,
          audioMimeType: `${bestAudio.mimeType}; codecs="${bestAudio.codecs}"`,
          format: {
            quality,
            fps: bestVideo.fps,
            codec: bestVideo.codecs
          },
          videoId,
          extractionTime: duration
        };
      }

      // ── Fallback: combined stream (max 720p) ────────────────────────────
      const bestFormat = this.innerTube.getBestFormat(formats);

      if (!bestFormat?.url) {
        logger.error(`No suitable format found. Available: ${formats.length}`);
        return { success: false, error: 'No suitable format found', fallback: true };
      }

      logger.info(`Combined fallback: ${bestFormat.qualityLabel || bestFormat.height + 'p'}`);
      logger.info(`InnerTube extracted ${videoId} in ${duration}ms`);

      return {
        success: true,
        adaptive: false,
        method: 'innertube',
        title: info.title,
        author: info.author,
        duration: info.lengthSeconds,
        viewCount: info.viewCount,
        thumbnail: info.thumbnail,
        streamUrl: bestFormat.url,
        format: {
          quality: bestFormat.qualityLabel || `${bestFormat.height}p`,
          hasVideo: bestFormat.hasVideo,
          hasAudio: bestFormat.hasAudio,
          fps: bestFormat.fps,
          codec: bestFormat.codecs
        },
        mimeType: bestFormat.mimeType,
        videoId,
        extractionTime: duration
      };

    } catch (error) {
      logger.error(`InnerTube extraction exception: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
      return { success: false, error: error.message, fallback: true };
    }
  }
  
  /**
   * Search videos using InnerTube
   */
  async search(query, maxResults = 20) {
    return await this.innerTube.search(query, maxResults);
  }
  
  /**
   * Get related videos
   */
  async getRelated(videoId, maxResults = 20) {
    return await this.innerTube.getRelated(videoId, maxResults);
  }
}