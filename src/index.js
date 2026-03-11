import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import input from 'input';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { program } from 'commander';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI Setup ───────────────────────────────────────────────
program
  .name('telegram-scraper')
  .description('Scrape Telegram channels/groups and export to JSON')
  .version('1.0.0')
  .option('-t, --target <username>', 'Channel or group username (e.g. @channelusername)')
  .option('-l, --limit <number>', 'Max messages to fetch (default: 100)', '100')
  .option('-o, --output <file>', 'Output JSON file name (default: auto)')
  .option('--offset-date <date>', 'Fetch messages before this date (YYYY-MM-DD)')
  .option('--min-id <id>', 'Fetch messages with ID greater than this')
  .option('--media', 'Include media info in output', false)
  .option('--pretty', 'Pretty print JSON output', false)
  .parse(process.argv);

const opts = program.opts();

// ─── Config ──────────────────────────────────────────────────
const API_ID = parseInt(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const SESSION_STRING = process.env.SESSION_STRING || '';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';

// ─── Helpers ─────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function parseDate(dateVal) {
  if (!dateVal) return null;
  const d = new Date(typeof dateVal === 'number' ? dateVal * 1000 : dateVal);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ─── Message Parser ───────────────────────────────────────────
function parseMessage(msg, includeMedia = false) {
  const base = {
    id: msg.id,
    date: parseDate(msg.date),
    type: msg.className || 'Message',
  };

  // Sender info
  if (msg.fromId) {
    if (msg.fromId.className === 'PeerUser') {
      base.from = { type: 'user', id: msg.fromId.userId?.toString() };
    } else if (msg.fromId.className === 'PeerChannel') {
      base.from = { type: 'channel', id: msg.fromId.channelId?.toString() };
    } else if (msg.fromId.className === 'PeerChat') {
      base.from = { type: 'chat', id: msg.fromId.chatId?.toString() };
    }
  }

  // Text & entities
  if (msg.message !== undefined) {
    base.text = msg.message || '';
  }

  if (msg.entities?.length) {
    base.entities = msg.entities.map(e => ({
      type: e.className,
      offset: e.offset,
      length: e.length,
      ...(e.url ? { url: e.url } : {}),
      ...(e.userId ? { userId: e.userId?.toString() } : {}),
    }));
  }

  // Views & forwards
  if (msg.views != null) base.views = msg.views;
  if (msg.forwards != null) base.forwards = msg.forwards;
  if (msg.replies?.replies != null) base.replies = msg.replies.replies;

  // Edit date
  if (msg.editDate) base.editDate = parseDate(msg.editDate);

  // Reply
  if (msg.replyTo) {
    base.replyToMsgId = msg.replyTo.replyToMsgId;
  }

  // Forward info
  if (msg.fwdFrom) {
    base.forwardedFrom = {
      date: parseDate(msg.fwdFrom.date),
      fromId: msg.fwdFrom.fromId?.toString() || null,
      fromName: msg.fwdFrom.fromName || null,
      channelPost: msg.fwdFrom.channelPost || null,
    };
  }

  // Reactions
  if (msg.reactions?.results?.length) {
    base.reactions = msg.reactions.results.map(r => ({
      emoji: r.reaction?.emoticon || r.reaction?.documentId?.toString(),
      count: r.count,
    }));
  }

  // Media
  if (includeMedia && msg.media) {
    const m = msg.media;
    const mediaObj = { type: m.className };

    if (m.className === 'MessageMediaPhoto' && m.photo) {
      mediaObj.photoId = m.photo.id?.toString();
      mediaObj.date = parseDate(m.photo.date);
    } else if (m.className === 'MessageMediaDocument' && m.document) {
      mediaObj.documentId = m.document.id?.toString();
      mediaObj.mimeType = m.document.mimeType;
      mediaObj.size = formatBytes(Number(m.document.size));
      const nameAttr = m.document.attributes?.find(a => a.className === 'DocumentAttributeFilename');
      if (nameAttr) mediaObj.fileName = nameAttr.fileName;
    } else if (m.className === 'MessageMediaWebPage' && m.webpage) {
      mediaObj.url = m.webpage.url;
      mediaObj.title = m.webpage.title;
      mediaObj.description = m.webpage.description;
    } else if (m.className === 'MessageMediaPoll' && m.poll) {
      mediaObj.question = m.poll.question?.text || m.poll.question;
      mediaObj.answers = m.poll.answers?.map(a => a.text?.text || a.text) || [];
    }

    base.media = mediaObj;
  }

  return base;
}

// ─── Channel/Group Info Parser ────────────────────────────────
function parseChannelInfo(entity) {
  return {
    id: entity.id?.toString(),
    title: entity.title || entity.username,
    username: entity.username || null,
    type: entity.className,
    participantsCount: entity.participantsCount || null,
    verified: entity.verified || false,
    restricted: entity.restricted || false,
    scam: entity.scam || false,
    fake: entity.fake || false,
    about: entity.about || null,
    date: parseDate(entity.date),
  };
}

// ─── Main Scraper ─────────────────────────────────────────────
async function scrape() {
  console.log(chalk.cyan('\n🚀 Telegram Scraper — Starting...\n'));

  if (!API_ID || !API_HASH) {
    console.error(chalk.red('❌ Missing API_ID or API_HASH in .env file'));
    console.log(chalk.yellow('👉 Get your credentials from https://my.telegram.org/apps'));
    process.exit(1);
  }

  // Session
  const session = new StringSession(SESSION_STRING);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  // Connect
  console.log(chalk.blue('🔌 Connecting to Telegram...'));
  await client.start({
    phoneNumber: async () => {
      const phone = process.env.PHONE_NUMBER || await input.text('📱 Phone number (with country code): ');
      return phone;
    },
    password: async () => await input.text('🔐 2FA Password (leave blank if none): '),
    phoneCode: async () => await input.text('📬 Verification code: '),
    onError: (err) => console.error(chalk.red('Error:', err)),
  });

  console.log(chalk.green('✅ Connected!\n'));

  // Save session
  const newSession = client.session.save();
  if (newSession && newSession !== SESSION_STRING) {
    console.log(chalk.yellow('💾 Save this SESSION_STRING to your .env to skip login next time:'));
    console.log(chalk.gray(newSession + '\n'));
    // Auto-update .env if it exists
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('SESSION_STRING=')) {
          envContent = envContent.replace(/SESSION_STRING=.*/, `SESSION_STRING=${newSession}`);
        } else {
          envContent += `\nSESSION_STRING=${newSession}`;
        }
        fs.writeFileSync(envPath, envContent);
        console.log(chalk.green('✅ Session saved to .env\n'));
      }
    } catch {}
  }

  // Get target
  let target = opts.target;
  if (!target) {
    target = await input.text('📢 Enter channel/group username (e.g. @username or https://t.me/username): ');
  }

  // Clean up username
  target = target.trim()
    .replace('https://t.me/', '')
    .replace('http://t.me/', '')
    .replace('@', '');

  const limit = parseInt(opts.limit) || 100;
  const includeMedia = opts.media;

  console.log(chalk.blue(`\n🔍 Fetching info for: @${target}`));

  // Get entity info
  let entity;
  try {
    entity = await client.getEntity(target);
  } catch (err) {
    console.error(chalk.red(`❌ Could not find: ${target}`));
    console.error(chalk.gray(err.message));
    await client.disconnect();
    process.exit(1);
  }

  const channelInfo = parseChannelInfo(entity);
  console.log(chalk.green(`✅ Found: ${channelInfo.title} (${channelInfo.type})`));
  if (channelInfo.participantsCount) {
    console.log(chalk.gray(`   Members: ${channelInfo.participantsCount.toLocaleString()}`));
  }

  // Build message fetch options
  const fetchOpts = {
    entity: target,
    limit,
  };

  if (opts.offsetDate) {
    fetchOpts.offsetDate = new Date(opts.offsetDate);
  }

  if (opts.minId) {
    fetchOpts.minId = parseInt(opts.minId);
  }

  // Fetch messages with progress bar
  console.log(chalk.blue(`\n📥 Fetching up to ${limit} messages...\n`));

  const bar = new cliProgress.SingleBar({
    format: chalk.cyan('{bar}') + ' {percentage}% | {value}/{total} messages',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });

  bar.start(limit, 0);

  const messages = [];
  let count = 0;

  for await (const msg of client.iterMessages(target, fetchOpts)) {
    const parsed = parseMessage(msg, includeMedia);
    messages.push(parsed);
    count++;
    bar.update(count);
    if (count >= limit) break;
  }

  bar.stop();

  // Build output object
  const output = {
    meta: {
      scrapedAt: new Date().toISOString(),
      target: `@${target}`,
      totalFetched: messages.length,
      options: {
        limit,
        includeMedia,
        offsetDate: opts.offsetDate || null,
        minId: opts.minId || null,
      },
    },
    channel: channelInfo,
    messages,
  };

  // Save output
  ensureDir(OUTPUT_DIR);

  const fileName = opts.output
    ? (opts.output.endsWith('.json') ? opts.output : opts.output + '.json')
    : `${target}_${Date.now()}.json`;

  const filePath = path.join(OUTPUT_DIR, fileName);

  fs.writeFileSync(
    filePath,
    opts.pretty
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output),
    'utf8'
  );

  const fileSize = formatBytes(fs.statSync(filePath).size);

  console.log(chalk.green(`\n✅ Done! Scraped ${messages.length} messages`));
  console.log(chalk.blue(`📄 Output: ${filePath} (${fileSize})\n`));

  // Preview
  if (messages.length > 0) {
    console.log(chalk.yellow('📝 Preview of first message:'));
    console.log(chalk.gray(JSON.stringify(messages[0], null, 2)));
  }

  await client.disconnect();
  return output;
}

// ─── Run ──────────────────────────────────────────────────────
scrape().catch(async (err) => {
  console.error(chalk.red('\n❌ Error:'), err.message);
  process.exit(1);
});
