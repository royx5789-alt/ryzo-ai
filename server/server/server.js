// RYZO AI - Backend server
// Menyimpan API key & password dengan aman di server.
// Frontend cuma manggil /api/login dan /api/chat.

const express = require('express');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RYZO_USERNAME = process.env.RYZO_USERNAME;
const RYZO_PASSWORD = process.env.RYZO_PASSWORD;

if (!ANTHROPIC_API_KEY) {
  console.warn('[RYZO AI] PERINGATAN: ANTHROPIC_API_KEY belum diset di file .env');
}
if (!RYZO_USERNAME || !RYZO_PASSWORD) {
  console.warn('[RYZO AI] PERINGATAN: RYZO_USERNAME / RYZO_PASSWORD belum diset di file .env');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Simple in-memory session store ----------
// Token disimpan di memori server. Kalau server restart, semua orang harus login ulang.
// Ini cukup untuk skala kecil/personal. Untuk skala besar, pakai database + JWT.
const activeTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Belum login atau sesi sudah habis. Silakan login ulang.' });
  }
  next();
}

// ---------- Login endpoint ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  if (username === RYZO_USERNAME && password === RYZO_PASSWORD) {
    const token = generateToken();
    activeTokens.add(token);
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Username atau password salah' });
});

app.post('/api/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  activeTokens.delete(token);
  res.json({ ok: true });
});

// ---------- Chat endpoint (dilindungi login) ----------
const SYSTEM_PROMPT = `Kamu adalah RYZO AI, asisten AI serba bisa berbahasa Indonesia yang cerdas, gacor, dan sangat membantu, selayaknya ChatGPT. Jawab pertanyaan dengan lengkap dan mendalam: berikan penjelasan yang jelas, contoh konkret bila relevan, dan langkah-langkah praktis bila diminta. Gunakan format markdown bila membantu (heading, bold, list, code block untuk kode). Kamu bisa membantu menjawab pertanyaan umum, menjelaskan konsep, membuat kode program lengkap, memberikan saran, menulis teks, dan menyelesaikan tugas kompleks lainnya. Gunakan bahasa Indonesia yang santai tapi tetap sopan dan mudah dipahami, kecuali pengguna menulis dalam bahasa lain. Sesuaikan panjang jawaban dengan kompleksitas pertanyaan; jangan terlalu singkat untuk hal yang butuh penjelasan.`;

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages wajib diisi (array)' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'Terjadi kesalahan pada API' });
    }

    const reply = (data.content || [])
      .map(block => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n');

    res.json({ reply });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan di server' });
  }
});

app.listen(PORT, () => {
  console.log(`RYZO AI server jalan di http://localhost:${PORT}`);
});
