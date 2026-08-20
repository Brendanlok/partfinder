/**
 * Fetch pending Telegram messages from authorized user.
 * Prints a JSON array of pending messages to stdout.
 * Updates state.json with the new offset so messages aren't reprocessed.
 * Photos are downloaded to telegram-bot/screenshots/ and their local path
 * is included in the message object as `photoPath` (Read it like any file).
 * Usage: node check.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const configPath    = path.join(__dirname, 'config.json');
const statePath     = path.join(__dirname, 'state.json');
const screenshotDir = path.join(__dirname, 'screenshots');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const state  = JSON.parse(readFileSync(statePath,  'utf8'));

if (!config.BOT_TOKEN || config.BOT_TOKEN === 'PASTE_YOUR_BOT_TOKEN_HERE') {
  console.log(JSON.stringify({ configured: false, messages: [] }));
  process.exit(0);
}

const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/getUpdates?offset=${state.lastOffset + 1}&timeout=5`;
let data;
try {
  const res = await fetch(url);
  data = await res.json();
} catch (e) {
  console.log(JSON.stringify({ configured: true, error: e.message, messages: [] }));
  process.exit(0);
}

if (!data.ok) {
  console.log(JSON.stringify({ configured: true, error: data.description, messages: [] }));
  process.exit(0);
}

const updates = data.result ?? [];

// Only accept messages from the authorized chat
const authorized = updates.filter(u => u.message && String(u.message.chat.id) === String(config.AUTHORIZED_CHAT_ID));

// Downloads the largest size of a Telegram photo array to screenshots/<messageId>.jpg
async function downloadPhoto(photoSizes, messageId) {
  const largest = photoSizes[photoSizes.length - 1];
  const fileInfoRes = await fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/getFile?file_id=${largest.file_id}`);
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok) return null;

  const fileUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${fileInfo.result.file_path}`;
  const imgRes = await fetch(fileUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  mkdirSync(screenshotDir, { recursive: true });
  const ext = path.extname(fileInfo.result.file_path) || '.jpg';
  const outPath = path.join(screenshotDir, `${messageId}${ext}`);
  writeFileSync(outPath, buf);
  return outPath;
}

const messages = [];
for (const u of authorized) {
  const m = u.message;
  const entry = {
    updateId: u.update_id,
    messageId: m.message_id,
    text: m.text ?? m.caption ?? '',
    date: new Date(m.date * 1000).toISOString(),
  };
  if (m.photo && m.photo.length > 0) {
    try {
      entry.photoPath = await downloadPhoto(m.photo, m.message_id);
    } catch (e) {
      entry.photoError = e.message;
    }
  }
  messages.push(entry);
}

// Advance offset past all received updates (including ignored ones)
if (updates.length > 0) {
  const maxOffset = Math.max(...updates.map(u => u.update_id));
  state.lastOffset = maxOffset;
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

console.log(JSON.stringify({ configured: true, messages }));
