# 📡 telegram-scrapper

> Scrape Telegram channels & groups — export messages + photos to JSON

[![npm version](https://img.shields.io/npm/v/telegram-scrapper.svg)](https://www.npmjs.com/package/telegram-scrapper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## ✨ Features

- 📥 Scrape **any public or private** channel / group (that you're a member of)
- 📄 Full structured **JSON** output — text, views, forwards, reactions, entities
- 📸 **Download photos** to disk, auto-named per message ID
- 🔁 **Session persistence** — login once, reuse forever
- 🖥️ **CLI** (`tg-scrapper`) + **Programmatic API**
- ⚡ Built on [GramJS](https://github.com/gram-js/gramjs) (MTProto)

---

## 📦 Installation

```bash
# Global install (CLI usage)
npm install -g telegram-scrapper

# Local install (programmatic usage)
npm install telegram-scrapper
```

---

## 🔑 Setup — Get API credentials

1. Go to **[https://my.telegram.org/apps](https://my.telegram.org/apps)**
2. Log in → click **Create new application**
3. Fill in any App title & short name, Platform: **Desktop**
4. Copy your **`API_ID`** and **`API_HASH`**

Create a `.env` file in your project root:

```env
API_ID=12345678
API_HASH=abcdef1234567890abcdef1234567890
PHONE_NUMBER=+989123456789
SESSION_STRING=        ← auto-filled after first login
```

---

## 🖥️ CLI Usage

```bash
# Basic
tg-scrapper --target IRTorino --limit 1000

# With photo download + pretty JSON
tg-scrapper -t IRTorino -l 1000 --photos --pretty

# Save to a specific file
tg-scrapper -t durov -l 500 -o durov_messages.json

# Fetch messages before a date
tg-scrapper -t some_channel --offset-date 2025-06-01

# Fetch messages newer than message ID 5000
tg-scrapper -t some_channel --min-id 5000
```

### All CLI options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--target <username>` | `-t` | Channel/group username (**required**) | — |
| `--limit <n>` | `-l` | Max messages to fetch | `100` |
| `--output <file>` | `-o` | Output JSON filename | auto |
| `--photos` | | Download photos to disk | `false` |
| `--photos-dir <dir>` | | Where to save photos | `./output/<target>/photos` |
| `--offset-date <date>` | | Fetch messages before date (YYYY-MM-DD) | — |
| `--min-id <n>` | | Fetch messages with ID > n | — |
| `--pretty` | | Pretty-print JSON | `false` |
| `--session <string>` | | Session string (overrides .env) | — |

---

## 💻 Programmatic API

```js
import { TelegramScrapper } from 'telegram-scrapper';

const scrapper = new TelegramScrapper({
  apiId:   12345678,
  apiHash: 'your_api_hash',
  session: process.env.SESSION_STRING, // optional — skip login
  phone:   '+989123456789',
});

// Connect (will prompt for code on first run)
const session = await scrapper.connect();
console.log('Save this session:', session); // persist to skip next login

// Scrape
const result = await scrapper.scrape({
  target:          'IRTorino',
  limit:           1000,
  downloadPhotos:  true,
  photosDir:       './photos/IRTorino',
  onProgress:      (cur, total) => console.log(`${cur}/${total}`),
});

console.log(result.meta);
console.log(result.channel);
console.log(result.messages[0]);

await scrapper.disconnect();
```

### `new TelegramScrapper(opts)`

| Option | Type | Description |
|--------|------|-------------|
| `apiId` | `number` | **Required.** Telegram API ID |
| `apiHash` | `string` | **Required.** Telegram API Hash |
| `session` | `string` | Saved session string (skip login) |
| `phone` | `string` | Phone number with country code |
| `onCode` | `async fn` | Custom fn to get verification code |
| `onPassword` | `async fn` | Custom fn to get 2FA password |

### `scrapper.scrape(opts)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `string` | **required** | Channel/group username |
| `limit` | `number` | `100` | Max messages to fetch |
| `downloadPhotos` | `boolean` | `false` | Download photo files to disk |
| `photosDir` | `string` | `./output/<target>/photos` | Photo save directory |
| `offsetDate` | `Date` | — | Fetch messages before this date |
| `minId` | `number` | — | Fetch messages with ID > minId |
| `onProgress` | `function` | — | `(current, total) => void` |

---

## 📄 JSON Output Format

```json
{
  "meta": {
    "scrapedAt": "2026-03-11T10:00:00.000Z",
    "target": "@IRTorino",
    "totalMessages": 1000,
    "totalPhotos": 214,
    "downloadedPhotos": 214,
    "failedPhotos": 0
  },
  "channel": {
    "id": "1234567890",
    "title": "ایران تورینو",
    "username": "IRTorino",
    "type": "Channel",
    "participantsCount": 18500,
    "verified": false,
    "about": "..."
  },
  "messages": [
    {
      "id": 4821,
      "date": "2026-03-11T09:00:00.000Z",
      "text": "متن پیام اینجاست",
      "views": 6200,
      "forwards": 42,
      "replies": 15,
      "hasPhoto": true,
      "photo": {
        "fileName": "photo_4821.jpg",
        "filePath": "output/IRTorino/photos/photo_4821.jpg",
        "sizeBytes": 251904,
        "sizeFormatted": "246 KB"
      },
      "reactions": [
        { "emoji": "👍", "count": 180 },
        { "emoji": "❤️", "count": 95 }
      ],
      "entities": [
        { "type": "MessageEntityBold", "offset": 0, "length": 8 }
      ]
    }
  ]
}
```

---

## 📁 Project Structure

```
telegram-scrapper/
├── bin/
│   └── cli.js          ← tg-scrapper command
├── src/
│   └── index.js        ← TelegramScrapper class + helpers
├── .env.example
├── .gitignore
├── .npmignore
├── package.json
└── README.md
```

---

## 🚀 Publish to npm

```bash
# 1. Login to npm
npm login

# 2. Publish
npm publish
```

---

## ⚠️ Notes

- **First run**: prompts for phone + verification code. Session is auto-saved to `.env`.
- **Private channels**: you must be a member.
- **Rate limits**: built-in 200ms delay between photo downloads.
- Use responsibly per [Telegram ToS](https://telegram.org/tos).

---

## 📜 License

MIT © [Hesam Hadadi](https://github.com/hesamhadadi)
