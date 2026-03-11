/**
 * batch.js — Scrape multiple channels/groups at once
 * Usage: node src/batch.js --config config/targets.json
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { program } from 'commander';

dotenv.config();

program
  .name('telegram-batch-scraper')
  .description('Batch scrape multiple Telegram channels/groups')
  .option('-c, --config <file>', 'JSON config file with targets', './config/targets.json')
  .option('--pretty', 'Pretty print JSON output', false)
  .parse(process.argv);

const opts = program.opts();

const API_ID = parseInt(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const SESSION_STRING = process.env.SESSION_STRING || '';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';

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

function parseMessage(msg) {
  return {
    id: msg.id,
    date: parseDate(msg.date),
    text: msg.message || '',
    views: msg.views || null,
    forwards: msg.forwards || null,
    reactions: msg.reactions?.results?.map(r => ({
      emoji: r.reaction?.emoticon,
      count: r.count,
    })) || [],
  };
}

async function scrapeTarget(client, target, limit = 100) {
  const username = target.replace('@', '').replace('https://t.me/', '');

  try {
    const entity = await client.getEntity(username);
    const messages = [];

    for await (const msg of client.iterMessages(username, { limit })) {
      messages.push(parseMessage(msg));
    }

    return {
      success: true,
      channel: {
        id: entity.id?.toString(),
        title: entity.title,
        username: entity.username,
        type: entity.className,
        participantsCount: entity.participantsCount || null,
      },
      messages,
      totalFetched: messages.length,
    };
  } catch (err) {
    return {
      success: false,
      target: username,
      error: err.message,
    };
  }
}

async function runBatch() {
  console.log(chalk.cyan('\n🚀 Telegram Batch Scraper\n'));

  // Load config
  const configPath = path.resolve(opts.config);
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`❌ Config file not found: ${configPath}`));
    console.log(chalk.yellow('👉 Create config/targets.json based on config/targets.example.json'));
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const { targets = [], defaultLimit = 100 } = config;

  if (!targets.length) {
    console.error(chalk.red('❌ No targets found in config'));
    process.exit(1);
  }

  console.log(chalk.blue(`📋 Found ${targets.length} target(s) to scrape\n`));

  // Connect
  const session = new StringSession(SESSION_STRING);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => process.env.PHONE_NUMBER || await input.text('📱 Phone: '),
    password: async () => await input.text('🔐 2FA Password: '),
    phoneCode: async () => await input.text('📬 Code: '),
    onError: (err) => console.error(err),
  });

  console.log(chalk.green('✅ Connected!\n'));

  // Scrape each target
  const results = {};
  const summary = { success: 0, failed: 0, totalMessages: 0 };

  for (const target of targets) {
    const username = typeof target === 'string' ? target : target.username;
    const limit = typeof target === 'object' && target.limit ? target.limit : defaultLimit;

    console.log(chalk.blue(`⏳ Scraping @${username.replace('@', '')} (limit: ${limit})...`));

    const result = await scrapeTarget(client, username, limit);

    if (result.success) {
      console.log(chalk.green(`  ✅ ${result.channel.title} — ${result.totalFetched} messages`));
      summary.success++;
      summary.totalMessages += result.totalFetched;
    } else {
      console.log(chalk.red(`  ❌ Failed: ${result.error}`));
      summary.failed++;
    }

    results[username.replace('@', '')] = result;

    // Delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save combined output
  ensureDir(OUTPUT_DIR);
  const outputData = {
    meta: {
      scrapedAt: new Date().toISOString(),
      totalTargets: targets.length,
      ...summary,
    },
    results,
  };

  const outFile = path.join(OUTPUT_DIR, `batch_${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    opts.pretty ? JSON.stringify(outputData, null, 2) : JSON.stringify(outputData),
    'utf8'
  );

  console.log(chalk.green(`\n✅ Batch complete!`));
  console.log(chalk.blue(`📊 Success: ${summary.success} | Failed: ${summary.failed} | Messages: ${summary.totalMessages}`));
  console.log(chalk.blue(`📄 Output: ${outFile} (${formatBytes(fs.statSync(outFile).size)})\n`));

  await client.disconnect();
}

runBatch().catch(err => {
  console.error(chalk.red('\n❌ Error:'), err.message);
  process.exit(1);
});
