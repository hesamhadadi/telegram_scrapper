/**
 * telegram-scrapper
 * Main library entry — use programmatically or via CLI
 *
 * @example
 * import { TelegramScrapper } from 'telegram-scrapper';
 *
 * const scrapper = new TelegramScrapper({ apiId: 123, apiHash: 'abc' });
 * await scrapper.connect();
 * const result = await scrapper.scrape({ target: 'IRTorino', limit: 1000, downloadPhotos: true });
 * await scrapper.disconnect();
 * console.log(result);
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs';
import path from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function toISO(dateVal) {
  if (!dateVal) return null;
  const d = new Date(typeof dateVal === 'number' ? dateVal * 1000 : dateVal);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Message parser ───────────────────────────────────────────────────────────

export function parseMessage(msg) {
  const out = {
    id:       msg.id,
    date:     toISO(msg.date),
    text:     msg.message || '',
    views:    msg.views    ?? null,
    forwards: msg.forwards ?? null,
    replies:  msg.replies?.replies ?? null,
    editDate: msg.editDate ? toISO(msg.editDate) : null,
    hasPhoto: false,
    photo:    null,
    media:    null,
  };

  // Entities
  if (msg.entities?.length) {
    out.entities = msg.entities.map(e => ({
      type:   e.className,
      offset: e.offset,
      length: e.length,
      ...(e.url    ? { url: e.url }                    : {}),
      ...(e.userId ? { userId: e.userId?.toString() }  : {}),
    }));
  }

  // Reactions
  if (msg.reactions?.results?.length) {
    out.reactions = msg.reactions.results.map(r => ({
      emoji: r.reaction?.emoticon ?? r.reaction?.documentId?.toString(),
      count: r.count,
    }));
  }

  // Forward origin
  if (msg.fwdFrom) {
    out.forwardedFrom = {
      date:        toISO(msg.fwdFrom.date),
      fromName:    msg.fwdFrom.fromName    ?? null,
      channelPost: msg.fwdFrom.channelPost ?? null,
    };
  }

  // Reply
  if (msg.replyTo) out.replyToMsgId = msg.replyTo.replyToMsgId;

  // Media
  if (msg.media) {
    const m = msg.media;
    if (m.className === 'MessageMediaPhoto') {
      out.hasPhoto = true;
      out.media = { type: 'photo', photoId: m.photo?.id?.toString() };
    } else if (m.className === 'MessageMediaDocument' && m.document) {
      out.media = {
        type:       'document',
        documentId: m.document.id?.toString(),
        mimeType:   m.document.mimeType,
        size:       formatBytes(Number(m.document.size)),
        fileName:   m.document.attributes
                      ?.find(a => a.className === 'DocumentAttributeFilename')
                      ?.fileName ?? null,
      };
    } else if (m.className === 'MessageMediaWebPage' && m.webpage) {
      out.media = {
        type:        'webpage',
        url:         m.webpage.url,
        title:       m.webpage.title        ?? null,
        description: m.webpage.description  ?? null,
      };
    } else if (m.className === 'MessageMediaPoll' && m.poll) {
      out.media = {
        type:     'poll',
        question: m.poll.question?.text ?? m.poll.question,
        answers:  m.poll.answers?.map(a => a.text?.text ?? a.text) ?? [],
      };
    } else {
      out.media = { type: m.className };
    }
  }

  return out;
}

// ─── Channel info parser ──────────────────────────────────────────────────────

export function parseChannelInfo(entity) {
  return {
    id:                entity.id?.toString(),
    title:             entity.title ?? entity.username,
    username:          entity.username  ?? null,
    type:              entity.className,
    participantsCount: entity.participantsCount ?? null,
    verified:          entity.verified  ?? false,
    restricted:        entity.restricted ?? false,
    scam:              entity.scam  ?? false,
    fake:              entity.fake  ?? false,
    about:             entity.about ?? null,
    date:              toISO(entity.date),
  };
}

// ─── TelegramScrapper class ───────────────────────────────────────────────────

export class TelegramScrapper {
  /**
   * @param {object} opts
   * @param {number}  opts.apiId       - Telegram API ID (from my.telegram.org)
   * @param {string}  opts.apiHash     - Telegram API Hash
   * @param {string}  [opts.session]   - Saved StringSession (skip login)
   * @param {string}  [opts.phone]     - Phone number (used when no session)
   * @param {function} [opts.onCode]   - Async fn that returns verification code
   * @param {function} [opts.onPassword] - Async fn that returns 2FA password
   */
  constructor(opts = {}) {
    this.apiId    = opts.apiId;
    this.apiHash  = opts.apiHash;
    this.phone    = opts.phone    || null;
    this._session = opts.session  || '';
    this._onCode     = opts.onCode     || (() => input.text('📬 Verification code: '));
    this._onPassword = opts.onPassword || (() => input.text('🔐 2FA password: '));

    if (!this.apiId || !this.apiHash) {
      throw new Error('apiId and apiHash are required. Get them from https://my.telegram.org/apps');
    }

    this.client = new TelegramClient(
      new StringSession(this._session),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5 }
    );
  }

  /** Connect & authenticate */
  async connect() {
    await this.client.start({
      phoneNumber: async () => this.phone || await input.text('📱 Phone (with country code): '),
      phoneCode:   this._onCode,
      password:    this._onPassword,
      onError:     (err) => { throw err; },
    });
    this._session = this.client.session.save();
    return this._session;
  }

  /** Returns the saved session string (persist this to skip next login) */
  getSession() {
    return this._session;
  }

  /** Disconnect cleanly */
  async disconnect() {
    await this.client.disconnect();
  }

  /**
   * Download photo for a raw message object
   * @param {object} rawMsg   - Raw telegram message
   * @param {string} destDir  - Directory to save photo in
   * @returns {object|null}
   */
  async downloadPhoto(rawMsg, destDir) {
    try {
      const buffer = await this.client.downloadMedia(rawMsg, { workers: 1 });
      if (!buffer || buffer.length === 0) return null;
      ensureDir(destDir);
      const fileName = `photo_${rawMsg.id}.jpg`;
      const filePath = path.join(destDir, fileName);
      fs.writeFileSync(filePath, buffer);
      return {
        fileName,
        filePath: filePath.replace(/\\/g, '/'),
        sizeBytes:     buffer.length,
        sizeFormatted: formatBytes(buffer.length),
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Scrape a channel or group
   *
   * @param {object}   opts
   * @param {string}   opts.target          - Username (e.g. 'IRTorino' or '@IRTorino')
   * @param {number}   [opts.limit=100]     - Max messages to fetch
   * @param {boolean}  [opts.downloadPhotos=false] - Download photo files to disk
   * @param {string}   [opts.photosDir]     - Where to save photos (default: ./output/<target>/photos)
   * @param {Date}     [opts.offsetDate]    - Fetch messages before this date
   * @param {number}   [opts.minId]         - Fetch messages with ID > minId
   * @param {function} [opts.onProgress]    - Called with (current, total) during fetch
   *
   * @returns {Promise<ScrapResult>}
   */
  async scrape(opts = {}) {
    const target       = (opts.target || '').replace(/^@/, '').replace('https://t.me/', '');
    const limit        = opts.limit         ?? 100;
    const dlPhotos     = opts.downloadPhotos ?? false;
    const photosDir    = opts.photosDir     ?? `./output/${target}/photos`;
    const onProgress   = opts.onProgress    ?? null;

    if (!target) throw new Error('target is required');

    // Resolve entity
    let entity;
    try {
      entity = await this.client.getEntity(target);
    } catch (err) {
      throw new Error(`Cannot find @${target}: ${err.message}`);
    }

    const channel = parseChannelInfo(entity);

    // Fetch messages
    const fetchOpts = { limit };
    if (opts.offsetDate) fetchOpts.offsetDate = opts.offsetDate;
    if (opts.minId)      fetchOpts.minId      = opts.minId;

    const rawMessages = [];
    let count = 0;

    for await (const msg of this.client.iterMessages(target, fetchOpts)) {
      rawMessages.push(msg);
      count++;
      if (onProgress) onProgress(count, limit);
      if (count >= limit) break;
    }

    // Parse
    const messages = rawMessages.map(parseMessage);

    // Download photos
    let downloadedPhotos = 0, failedPhotos = 0;

    if (dlPhotos) {
      const photoMsgs = rawMessages.filter(m => m.media?.className === 'MessageMediaPhoto');

      for (const rawMsg of photoMsgs) {
        const idx = messages.findIndex(m => m.id === rawMsg.id);
        const result = await this.downloadPhoto(rawMsg, photosDir);

        if (result && !result.error) {
          messages[idx].photo = result;
          downloadedPhotos++;
        } else {
          messages[idx].photo = { error: result?.error ?? 'unknown' };
          failedPhotos++;
        }

        // small delay — avoid rate limit
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return {
      meta: {
        scrapedAt:        new Date().toISOString(),
        target:           `@${target}`,
        totalMessages:    messages.length,
        totalPhotos:      messages.filter(m => m.hasPhoto).length,
        downloadedPhotos,
        failedPhotos,
      },
      channel,
      messages,
    };
  }
}

export default TelegramScrapper;
