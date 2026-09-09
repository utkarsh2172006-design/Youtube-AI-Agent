# 🚀 YouTube AI Content Agent & Research Radar

An end-to-end autonomous AI Content Agent designed for YouTube creators. Built directly on the **YouTube Data API v3** and **Google Gemini API**, featuring a multi-dimensional **Creator Research Radar**, intelligent caption & keyword generation, and direct scheduled publishing.

---

## 🌟 Key Features

### 1. 🔍 Creator Research Radar (100% Native YouTube Data)
* **⚡ High-Velocity Outliers**: Discovers breakout videos that exploded faster than normal (calculated via `outlierScore` and `viewVelocity` views/hr).
* **🎯 Channel Audience Match**: Dynamically grounded in your channel's real upload history (e.g. *Grandmaster Rank Push, Secret Skill Combos, Booyah Strategy*).
* **🌐 Beyond Relevancy (Macro Trending)**: Pulls real-time YouTube Gaming charts outside your direct niche with automated Free Fire challenge adaptation hooks.
* **🔥 Strict 80K–100K+ View Filter**: Excludes low-reach noise; only presents proven, high-performing videos with mass reach.
* **📅 Upload Date & Momentum Badges**: Every card features the exact publish date and a glowing relative recency pill (e.g. `⚡ 2d ago`, `🕒 3d ago`).
* **▶ Direct Watch & 1-Click Remix**: Click straight to YouTube or port the concept and indexed tags directly into the AI upload generator.

### 2. ✍️ AI Content & Caption Generator (Gemini Flash)
* Generates high-CTR video titles matching your channel branding.
* Produces comprehensive 4,500–4,800 character descriptions adhering strictly to YouTube SEO rules.
* Groups keywords into 3 distinct clusters:
  1. *Keywords Related To Video*
  2. *Keywords Related To Search Intent*
  3. *Keywords Related To Trends & Updates*
* Real human gamer tone, removing robotic AI filler phrases.

### 3. 🗓 Automated Scheduler & Direct Uploader
* OAuth 2.0 direct connection with YouTube.
* Upload video files, select publish date/time, and queue for automatic publishing.
* Visual countdown and schedule queue management.

---

## 🛠 Tech Stack

* **Backend**: Node.js, Express.js
* **APIs**:
  * [YouTube Data API v3](https://developers.google.com/youtube/v3)
  * [Google Gemini API (@google/genai)](https://ai.google.dev/)
* **Frontend**: HTML5, Vanilla JavaScript, Modern Glassmorphic CSS

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/utkarsh2172006-design/Youtube-AI-Agent.git
cd Youtube-AI-Agent
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your API credentials in `.env`:
```env
PORT=3000
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=your_custom_session_secret
```

### 3. Run the Dashboard
```bash
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 🔒 Security & Privacy

* Sensitive files (`.env`, `tokens.json`, `client_secret*.json`, `cache_*.json`, and `uploads/`) are protected by `.gitignore` and never committed.
* OAuth tokens are stored locally on your machine.

---

## 📄 License
MIT License
