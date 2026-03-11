#!/usr/bin/env node
/**
 * tg-scrapper CLI
 * Installed globally: npx tg-scrapper --target IRTorino --limit 1000 --photos
 */

import { program } from 'commander';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { TelegramScrapper, ensureDir, formatBytes } from '../src/index.js';

dotenv.config();

// ─── CLI definition ───────────────────────────────────────────────────────────

program
  .name('tg-scrapper')
  .description('Scrape Telegram channels/groups → JSON  |  github.com/hesamhadadi/telegram_scrapper')
  .version('1.0.0')
  .requiredOption('-t, --target <username>',  'Channel or group username (e.g. IRTorino or @IRTorino)')
  .option('-l, --limit <n>',                  'Max messages to fetch',          '100')
  .option('-o, --output <file>',              'Output JSON file (default: auto)')
  .option('--photos',                         'Download photos to disk',         false)
  .option('--photos-dir <dir>',               'Directory to save photos')
  .option('--offset-date <YYYY-MM-DD>',       'Fetch messages before this date')
  .option('--min-id <n>',                     'Fetch messages with ID > n')
  .option('--pretty',                         'Pretty-print JSON output',        false)
  .option('--session <string>',               'Session string (overrides .env)')
  .addHelpText('after', `
Examples:
  tg-scrapper -t IRTorino -l 1000 --photos --pretty
  tg-scrapper -t durov    -l 500  -o durov.json
  tg-scrapper -t some_group --offset-date 2025-01-01
`)
  .parse(process.argv);

const opts = program.opts();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function banner() {
  console.log(chalk.cyan('\n ████████╗ ██████╗      ███████╗ ██████╗██████╗  █████╗ ██████╗ ██████╗ ███████╗██████╗ '));
  console.log(chalk.cyan(' ╚══██╔══╝██╔════╝      ██╔════╝██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗'));
  console.log(chalk.cyan('    ██║   ██║  ███╗█████╗███████╗██║     ██████╔╝███████║██████╔╝██████╔╝█████╗  ██████╔╝'));
  console.log(chalk.cyan('    ██║   ██║   ██║╚════╝╚════██║██║     ██╔══██╗██╔══██║██╔═══╝ ██╔═══╝ ██╔══╝  ██╔══██╗'));
  console.log(chalk.cyan('    ██║   ╚██████╔╝      ███████║╚██████╗██║  ██║██║  ██║██║     ██║     ███████╗██║  ██║'));
  console.log(chalk.cyan('    ╚═╝    ╚═════╝       ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝     ╚══════╝╚═╝  ╚═╝'));
  console.log(chalk.gray('  github.com/hesamhadadi/telegram_scrapper\n'));
}

function saveSession(sessionStr) {
  try {
    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
      let env = fs.readFileSync(envPath, 'utf8');
      env = env.includes('SESSION_STRING=')
        ? env.replace(/SESSION_STRING=.*/, `SESSION_STRING=${sessionStr}`)
        : env + `\nSESSION_STRING=${sessionStr}`;
      fs.writeFileSync(envPath, env);
      console.log(chalk.green('  💾  Session saved to .env — next run skips login\n'));
    } else {
      console.log(chalk.yellow('  💾  Save this to your .env as SESSION_STRING='));
      console.log(chalk.gray('  ' + sessionStr + '\n'));
    }
  } catch {}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  banner();

  const apiId   = parseInt(process.env.API_ID);
  const apiHash = process.env.API_HASH;
  const session = opts.session || process.env.SESSION_STRING || '';

  if (!apiId || !apiHash) {
    console.error(chalk.red('  ❌  API_ID and API_HASH are required.\n'));
    console.log(chalk.yellow('  1. Go to https://my.telegram.org/apps'));
    console.log(chalk.yellow('  2. Create an app and copy API_ID + API_HASH'));
    console.log(chalk.yellow('  3. Add them to a .env file:\n'));
    console.log(chalk.gray('     API_ID=12345678'));
    console.log(chalk.gray('     API_HASH=abcdef...\n'));
    process.exit(1);
  }

  const scrapper = new TelegramScrapper({
    apiId,
    apiHash,
    session,
    phone: process.env.PHONE_NUMBER,
  });

  // ── Connect ──────────────────────────────────────────────────
  console.log(chalk.blue('  🔌  Connecting to Telegram…'));
  const newSession = await scrapper.connect();
  console.log(chalk.green('  ✅  Connected!\n'));

  if (newSession && newSession !== session) saveSession(newSession);

  // ── Scrape ───────────────────────────────────────────────────
  const target  = opts.target;
  const limit   = parseInt(opts.limit);
  const dlPhotos = opts.photos;
  const outputDir = `./output/${target.replace('@', '')}`;

  console.log(chalk.blue(`  🎯  Target  : @${target.replace('@', '')}`));
  console.log(chalk.blue(`  📦  Messages: ${limit}`));
  console.log(chalk.blue(`  📸  Photos  : ${dlPhotos ? 'yes (downloading)' : 'no'}\n`));

  // Progress bar
  const bar = new cliProgress.SingleBar({
    format: '  ' + chalk.cyan('{bar}') + '  {percentage}%  |  {value}/{total} messages',
    barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
  });
  bar.start(limit, 0);

  let result;
  try {
    result = await scrapper.scrape({
      target,
      limit,
      downloadPhotos: dlPhotos,
      photosDir:  opts.photosDir ?? `${outputDir}/photos`,
      offsetDate: opts.offsetDate ? new Date(opts.offsetDate) : undefined,
      minId:      opts.minId      ? parseInt(opts.minId)      : undefined,
      onProgress: (cur) => bar.update(cur),
    });
  } catch (err) {
    bar.stop();
    console.error(chalk.red(`\n  ❌  ${err.message}`));
    await scrapper.disconnect();
    process.exit(1);
  }

  bar.stop();

  // ── Save JSON ─────────────────────────────────────────────────
  ensureDir(outputDir);

  const fileName = opts.output
    ? (opts.output.endsWith('.json') ? opts.output : opts.output + '.json')
    : `${target.replace('@', '')}_${Date.now()}.json`;

  const filePath = path.join(outputDir, fileName);

  fs.writeFileSync(
    filePath,
    opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result),
    'utf8',
  );

  const fileSize = formatBytes(fs.statSync(filePath).size);

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n  ' + chalk.green('─'.repeat(46)));
  console.log(chalk.green('  ✅  Done!'));
  console.log(chalk.white(`  📄  Messages  : ${result.meta.totalMessages}`));
  if (dlPhotos) {
    console.log(chalk.white(`  📸  Photos    : ${result.meta.downloadedPhotos} downloaded  /  ${result.meta.failedPhotos} failed`));
    console.log(chalk.white(`  📁  Photos dir: ${opts.photosDir ?? outputDir + '/photos'}`));
  }
  console.log(chalk.white(`  💾  JSON file : ${filePath}  (${fileSize})`));
  console.log('  ' + chalk.green('─'.repeat(46)) + '\n');

  await scrapper.disconnect();
}

main().catch(err => {
  console.error(chalk.red('\n  ❌  Fatal error:'), err.message);
  process.exit(1);
});
