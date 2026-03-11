# 📡 Telegram Scraper

A powerful Node.js tool to scrape messages from Telegram channels and groups and export them as structured JSON.

---

## ✨ Features

- ✅ Scrape any **public or private** channel / group (that you're a member of)
- ✅ Export messages as **structured JSON**
- ✅ Includes message text, views, forwards, replies, reactions, entities
- ✅ Optional **media info** (photos, documents, polls, links)
- ✅ **Batch scraping** — multiple targets at once from a config file
- ✅ **Session saving** — login once, reuse session
- ✅ CLI with full options (limit, offset date, min ID, output file)
- ✅ Progress bar during scraping

---

## 📦 Installation

```bash
git clone https://github.com/YOUR_USERNAME/telegram-scraper.git
cd telegram-scraper
npm install
```

---

## 🔑 Setup

### 1. Get your Telegram API credentials

1. Go to [https://my.telegram.org/apps](https://my.telegram.org/apps)
2. Log in with your phone number
3. Click **Create new application**
4. Copy your **API ID** and **API Hash**

### 2. Create `.env` file

```bash
cp .env.example .env
```

Edit `.env`:

```env
API_ID=12345678
API_HASH=abcdef1234567890abcdef1234567890
PHONE_NUMBER=+989123456789
```

---

## 🚀 Usage

### Single channel/group

```bash
# Basic usage (interactive)
npm start

# With options
node src/index.js --target @channelname --limit 500

# Specific output file
node src/index.js -t @channelname -l 200 -o my_data.json

# Include media info
node src/index.js -t @channelname --media

# Pretty print JSON
node src/index.js -t @channelname --pretty

# Fetch messages before a date
node src/index.js -t @channelname --offset-date 2025-01-01

# Fetch messages with ID > 1000
node src/index.js -t @channelname --min-id 1000
```

### All CLI options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--target` | `-t` | Channel/group username | (interactive) |
| `--limit` | `-l` | Max messages to fetch | `100` |
| `--output` | `-o` | Output JSON filename | auto |
| `--offset-date` | | Fetch messages before date | — |
| `--min-id` | | Fetch messages with ID > N | — |
| `--media` | | Include media info | `false` |
| `--pretty` | | Pretty print JSON | `false` |

---

### Batch scraping (multiple targets)

1. Copy and edit the config:

```bash
cp config/targets.example.json config/targets.json
```

2. Edit `config/targets.json`:

```json
{
  "defaultLimit": 100,
  "targets": [
    "@channel_one",
    { "username": "@channel_two", "limit": 500 },
    "@some_group"
  ]
}
```

3. Run batch:

```bash
node src/batch.js

# With custom config
node src/batch.js --config config/my_targets.json

# Pretty output
node src/batch.js --pretty
```

---

## 📄 JSON Output Format

### Single scrape

```json
{
  "meta": {
    "scrapedAt": "2026-03-11T10:00:00.000Z",
    "target": "@channelname",
    "totalFetched": 100,
    "options": { "limit": 100, "includeMedia": false }
  },
  "channel": {
    "id": "1234567890",
    "title": "Channel Title",
    "username": "channelname",
    "type": "Channel",
    "participantsCount": 15000,
    "verified": false,
    "about": "Channel description"
  },
  "messages": [
    {
      "id": 1001,
      "date": "2026-03-11T09:55:00.000Z",
      "type": "Message",
      "from": { "type": "channel", "id": "1234567890" },
      "text": "Message content here",
      "views": 4200,
      "forwards": 38,
      "replies": 12,
      "reactions": [
        { "emoji": "👍", "count": 120 }
      ],
      "entities": [
        { "type": "MessageEntityBold", "offset": 0, "length": 7 }
      ]
    }
  ]
}
```

### Media info (with `--media` flag)

```json
{
  "id": 1002,
  "text": "Check this file",
  "media": {
    "type": "MessageMediaDocument",
    "documentId": "5678901234",
    "mimeType": "application/pdf",
    "size": "2.5 MB",
    "fileName": "report.pdf"
  }
}
```

---

## 📁 Project Structure

```
telegram-scraper/
├── src/
│   ├── index.js          # Main single-target scraper
│   └── batch.js          # Multi-target batch scraper
├── config/
│   └── targets.example.json
├── output/
│   └── example_output.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## ⚠️ Important Notes

- **First run**: You'll be asked to enter your phone number and verification code. After that, a session string is saved in `.env` automatically — no need to log in again.
- **Private channels/groups**: You must be a member to scrape them.
- **Rate limits**: Telegram has rate limits. For large scrapes, use `--limit` wisely or add delays between batch items.
- **Terms of Service**: Use responsibly and in accordance with [Telegram's ToS](https://telegram.org/tos).

---

## 📜 License

MIT
