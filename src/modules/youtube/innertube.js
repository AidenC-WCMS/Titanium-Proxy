import https from 'https';
import { logger } from '../../core/logger.js';

/**
 * InnerTube API client with visitor_data handshake + multi-client fallback.
 *
 * YouTube's PO Token enforcement requires a visitor_data token obtained from
 * a real YouTube page load. We fetch this once at startup and cache it.
 * This makes our requests look like they originate from a real browser session.
 *
 * Client order for stream extraction:
 *   1. ANDROID (with visitor_data)
 *   2. ANDROID_VR
 *   3. ANDROID_TESTSUITE
 */

const CLIENTS = {
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '19.44.38',
    clientNameHeader: '3',
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US) gzip',
    androidSdkVersion: 34,
    osName: 'Android',
    osVersion: '14',
  },
  ANDROID_VR: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.57.29',
    clientNameHeader: '28',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    androidSdkVersion: 32,
    osName: 'Android',
    osVersion: '12L',
  },
  ANDROID_TESTSUITE: {
    clientName: 'ANDROID_TESTSUITE',
    clientVersion: '1.9',
    clientNameHeader: '30',
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 14; en_US) gzip',
    androidSdkVersion: 34,
    osName: 'Android',
    osVersion: '14',
  },
  WEB: {
    clientName: 'WEB',
    clientVersion: '2.20240726.00.00',
    clientNameHeader: '1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  }
};

export class InnerTubeClient {
  constructor(config) {
    this.config = config;
    this.visitorData = null;
    this.visitorDataExpiry = 0;
    this._visitorFetchPromise = null;
  }

  // ─── Visitor Data ──────────────────────────────────────────────────────────

  /**
   * Fetch a real visitor_data token from YouTube's homepage.
   * This makes InnerTube requests look like they come from a real browser.
   * Cached for 30 minutes.
   */
  async getVisitorData() {
    const now = Date.now();
    if (this.visitorData && now < this.visitorDataExpiry) {
      return this.visitorData;
    }

    // Prevent concurrent fetches
    if (this._visitorFetchPromise) return this._visitorFetchPromise;

    this._visitorFetchPromise = this._fetchVisitorData().finally(() => {
      this._visitorFetchPromise = null;
    });

    return this._visitorFetchPromise;
  }

  async _fetchVisitorData() {
    try {
      logger.info('Fetching YouTube visitor_data...');
      const html = await this._fetchPage('https://www.youtube.com/?hl=en');

      // Extract visitor_data from ytcfg
      const match = html.match(/"visitorData"\s*:\s*"([^"]+)"/);
      if (match) {
        this.visitorData = match[1];
        this.visitorDataExpiry = Date.now() + 30 * 60 * 1000; // 30 min
        logger.info(`Got visitor_data: ${this.visitorData.substring(0, 20)}...`);
        return this.visitorData;
      }

      // Fallback: try VISITOR_INFO1_LIVE from ytInitialData
      const match2 = html.match(/"VISITOR_INFO1_LIVE"\s*:\s*"([^"]+)"/);
      if (match2) {
        this.visitorData = match2[1];
        this.visitorDataExpiry = Date.now() + 30 * 60 * 1000;
        logger.info(`Got visitor_data (VISITOR_INFO1_LIVE): ${this.visitorData.substring(0, 20)}...`);
        return this.visitorData;
      }

      logger.warn('Could not extract visitor_data from YouTube homepage');
      return null;
    } catch (err) {
      logger.error(`Failed to fetch visitor_data: ${err.message}`);
      return null;
    }
  }

  _fetchPage(url) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'www.youtube.com',
        path: '/?hl=en',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      };
      const req = https.request(opts, res => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchPage(res.headers.location));
        }
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async getVideoInfo(videoId) {
    const visitorData = await this.getVisitorData();
    const clientOrder = ['ANDROID', 'ANDROID_VR', 'ANDROID_TESTSUITE'];

    for (const key of clientOrder) {
      const client = CLIENTS[key];
      logger.info(`Trying ${client.clientName} for ${videoId}`);
      try {
        const result = await this._fetchPlayer(videoId, client, visitorData);
        if (result.success) {
          logger.info(`${client.clientName} succeeded for ${videoId}`);
          return result;
        }
        logger.warn(`${client.clientName} failed: ${result.error}`);
      } catch (err) {
        logger.warn(`${client.clientName} threw: ${err.message}`);
      }
    }

    return { success: false, error: 'All clients failed to extract stream', videoId };
  }

  getBestFormat(formats) {
    const combined = formats.filter(f => f.hasVideo && f.hasAudio);
    if (combined.length > 0) {
      return combined.sort((a, b) =>
        ((b.height || 0) - (a.height || 0)) || ((b.bitrate || 0) - (a.bitrate || 0))
      )[0];
    }
    const videoOnly = formats.filter(f => f.hasVideo);
    if (videoOnly.length > 0) {
      return videoOnly.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    }
    return formats[0];
  }

  async search(query, maxResults = 20) {
    try {
      const data = await this._request('search', {
        query,
        context: this._ctx(CLIENTS.WEB)
      }, CLIENTS.WEB);

      const results = [];
      const contents = data.contents?.twoColumnSearchResultsRenderer
        ?.primaryContents?.sectionListRenderer?.contents || [];

      for (const section of contents) {
        for (const item of (section.itemSectionRenderer?.contents || [])) {
          if (item.videoRenderer) {
            const v = item.videoRenderer;
            results.push({
              videoId: v.videoId,
              title: v.title?.runs?.[0]?.text || '',
              author: v.ownerText?.runs?.[0]?.text || '',
              authorId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
              duration: this._parseDuration(v.lengthText?.simpleText),
              viewCount: this._parseViewCount(v.viewCountText?.simpleText),
              thumbnail: v.thumbnail?.thumbnails?.[0]?.url,
              publishedTime: v.publishedTimeText?.simpleText || ''
            });
            if (results.length >= maxResults) break;
          }
        }
        if (results.length >= maxResults) break;
      }

      return { success: true, results, query };
    } catch (err) {
      logger.error(`Search failed: ${err.message}`);
      return { success: false, error: err.message, results: [] };
    }
  }

  async getRelated(videoId, maxResults = 20) {
    try {
      const data = await this._request('next', {
        videoId,
        context: this._ctx(CLIENTS.WEB)
      }, CLIENTS.WEB);

      const results = [];
      const items = data.contents?.twoColumnWatchNextResults
        ?.secondaryResults?.secondaryResults?.results || [];

      for (const item of items) {
        if (item.compactVideoRenderer) {
          const v = item.compactVideoRenderer;
          results.push({
            videoId: v.videoId,
            title: v.title?.simpleText || '',
            author: v.longBylineText?.runs?.[0]?.text || '',
            duration: this._parseDuration(v.lengthText?.simpleText),
            viewCount: this._parseViewCount(v.viewCountText?.simpleText),
            thumbnail: v.thumbnail?.thumbnails?.[0]?.url
          });
          if (results.length >= maxResults) break;
        }
      }

      return { success: true, results };
    } catch (err) {
      logger.error(`Related failed: ${err.message}`);
      return { success: false, error: err.message, results: [] };
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  async _fetchPlayer(videoId, client, visitorData) {
    const body = { videoId, context: this._ctx(client, visitorData) };
    const data = await this._request('player', body, client, visitorData);

    const status = data.playabilityStatus?.status;
    const reason = data.playabilityStatus?.reason || 'Video unavailable';
    const topKeys = Object.keys(data).join(', ');

    if (status !== 'OK') {
      logger.error(`[${client.clientName}] playability: ${status || 'UNKNOWN'} - ${reason}`);
      logger.error(`[${client.clientName}] response keys: ${topKeys}`);
      if (data.playabilityStatus?.errorScreen) {
        logger.error(`[${client.clientName}] errorScreen: ${JSON.stringify(data.playabilityStatus.errorScreen)}`);
      }
      return { success: false, error: `${status || 'UNKNOWN'}: ${reason}`, videoId };
    }

    if (!data.streamingData) {
      logger.error(`[${client.clientName}] no streamingData. keys: ${topKeys}`);
      return { success: false, error: 'No streaming data', videoId };
    }

    const formats = this._parseFormats(data.streamingData);
    const vd = data.videoDetails;

    logger.info(`[${client.clientName}] ${formats.length} formats (${formats.filter(f => f.hasVideo && f.hasAudio).length} combined)`);

    return {
      success: true,
      videoId,
      title: vd?.title,
      author: vd?.author,
      lengthSeconds: parseInt(vd?.lengthSeconds),
      viewCount: parseInt(vd?.viewCount),
      thumbnail: vd?.thumbnail?.thumbnails?.[0]?.url,
      formats
    };
  }

  _ctx(client, visitorData = null) {
    const c = {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        userAgent: client.userAgent
      }
    };
    if (visitorData)          c.client.visitorData      = visitorData;
    if (client.androidSdkVersion) c.client.androidSdkVersion = client.androidSdkVersion;
    if (client.osName)        c.client.osName           = client.osName;
    if (client.osVersion)     c.client.osVersion        = client.osVersion;
    return c;
  }

  _parseFormats(sd) {
    const out = [];
    for (const f of (sd.formats || []))         out.push(this._fmt(f));
    for (const f of (sd.adaptiveFormats || [])) out.push(this._fmt(f));
    return out;
  }

  _fmt(f) {
    const [type, codecInfo] = (f.mimeType || '').split(';');
    const [mediaType] = type.split('/');
    return {
      itag: f.itag,
      url: f.url,
      mimeType: type,
      codecs: codecInfo?.match(/codecs="([^"]+)"/)?.[1] || '',
      bitrate: f.bitrate,
      width: f.width,
      height: f.height,
      fps: f.fps,
      quality: f.quality,
      qualityLabel: f.qualityLabel,
      audioQuality: f.audioQuality,
      audioSampleRate: f.audioSampleRate,
      hasVideo: mediaType === 'video',
      hasAudio: f.audioQuality !== undefined,
      contentLength: f.contentLength,
      lastModified: f.lastModified
    };
  }

  _request(endpoint, body, client, visitorData = null) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': client.userAgent,
        'X-YouTube-Client-Name': client.clientNameHeader,
        'X-YouTube-Client-Version': client.clientVersion,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'X-Goog-Api-Format-Version': '2'
      };
      if (visitorData) {
        headers['X-Goog-Visitor-Id'] = visitorData;
      }

      const req = https.request({
        hostname: 'www.youtube.com',
        path: `/youtubei/v1/${endpoint}?prettyPrint=false`,
        method: 'POST',
        headers
      }, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            logger.error(`[${client.clientName}] JSON parse failed. HTTP ${res.statusCode}. Body[:300]: ${raw.substring(0, 300)}`);
            reject(new Error('Failed to parse response'));
          }
        });
      });
      req.on('error', e => reject(e));
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(data);
      req.end();
    });
  }

  _parseDuration(s) {
    if (!s) return 0;
    const p = s.split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0] || 0;
  }

  _parseViewCount(s) {
    if (!s) return 0;
    const m = s.match(/[\d,]+/);
    return m ? parseInt(m[0].replace(/,/g, '')) : 0;
  }
}