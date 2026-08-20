/**
 * Send a message to the configured Telegram chat.
 * Usage: node send.mjs "Your message here"
 *        node send.mjs "Message" --parse-mode markdown
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const text      = process.argv[2] ?? '(no message)';
const parseMode = process.argv.includes('--parse-mode') ? process.argv[process.argv.indexOf('--parse-mode') + 1] : null;

if (!config.BOT_TOKEN || config.BOT_TOKEN === 'PASTE_YOUR_BOT_TOKEN_HERE') {
  console.error('ERROR: BOT_TOKEN not configured in telegram-bot/config.json');
  process.exit(1);
}

const body = {
  chat_id: config.CHAT_ID,
  text,
  ...(parseMode ? { parse_mode: parseMode } : {}),
};

const res = await fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const data = await res.json();
if (!data.ok) {
  console.error('Telegram error:', data.description);
  process.exit(1);
}
console.log('Sent:', data.result.message_id);
