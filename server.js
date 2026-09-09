require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ai-agent-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Token storage file
const TOKEN_FILE = path.join(__dirname, 'tokens.json');

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// Scheduled posts storage
const SCHEDULED_FILE = path.join(__dirname, 'scheduled_posts.json');

function loadScheduledPosts() {
  try {
    if (fs.existsSync(SCHEDULED_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULED_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveScheduledPosts(posts) {
  fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(posts, null, 2));
}

// ============================================================
// YOUTUBE / GOOGLE AUTH
// ============================================================
const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Step 1: Redirect user to Google's consent screen
app.get('/auth/youtube', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your_google_client_id_here') {
    return res.redirect('/?error=youtube_not_configured');
  }
  const oauth2Client = getOAuthClient();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// Step 2: Google redirects back here with a code
app.get('/auth/youtube/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/?error=youtube_denied');

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user profile
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const profile = await oauth2.userinfo.get();

    // Get YouTube channel info
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({ part: 'snippet,statistics', mine: true });
    const channel = channelRes.data.items?.[0];

    // Save tokens + user info
    const stored = loadTokens();
    stored.youtube = {
      tokens,
      profile: {
        name: profile.data.name,
        email: profile.data.email,
        picture: profile.data.picture,
        channelName: channel?.snippet?.title || profile.data.name,
        channelId: channel?.id,
        subscribers: channel?.statistics?.subscriberCount || '0'
      },
      connected_at: new Date().toISOString()
    };
    saveTokens(stored);
    req.session.youtubeConnected = true;

    res.redirect('/dashboard.html?connected=youtube');
  } catch (err) {
    console.error('YouTube auth error:', err.message);
    res.redirect('/?error=youtube_failed');
  }
});

// ============================================================
// INSTAGRAM / META AUTH
// ============================================================
const axios = require('axios');

// Step 1: Redirect user to Facebook's consent screen
app.get('/auth/instagram', (req, res) => {
  if (!process.env.META_APP_ID || process.env.META_APP_ID === 'your_meta_app_id_here') {
    return res.redirect('/?error=instagram_not_configured');
  }
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_media',
    'pages_read_engagement',
    'pages_show_list'
  ].join(',');

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${process.env.META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}` +
    `&scope=${scopes}` +
    `&response_type=code`;

  res.redirect(authUrl);
});

// Step 2: Meta redirects back here with a code
app.get('/auth/instagram/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/?error=instagram_denied');

  try {
    // Exchange code for access token
    const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code
      }
    });
    const { access_token } = tokenRes.data;

    // Get Facebook Pages
    const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { access_token }
    });
    const pages = pagesRes.data.data;
    if (!pages || pages.length === 0) {
      return res.redirect('/?error=no_facebook_page');
    }
    const page = pages[0];
    const pageToken = page.access_token;

    // Get Instagram Business Account
    const igRes = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
      params: { fields: 'instagram_business_account', access_token: pageToken }
    });
    const igAccountId = igRes.data.instagram_business_account?.id;
    if (!igAccountId) {
      return res.redirect('/?error=no_instagram_business');
    }

    // Get Instagram profile info
    const igProfileRes = await axios.get(`https://graph.facebook.com/v19.0/${igAccountId}`, {
      params: {
        fields: 'username,name,profile_picture_url,followers_count,media_count',
        access_token: pageToken
      }
    });
    const igProfile = igProfileRes.data;

    // Save tokens + profile
    const stored = loadTokens();
    stored.instagram = {
      access_token: pageToken,
      instagram_account_id: igAccountId,
      profile: {
        username: igProfile.username,
        name: igProfile.name,
        picture: igProfile.profile_picture_url,
        followers: igProfile.followers_count,
        posts: igProfile.media_count
      },
      connected_at: new Date().toISOString()
    };
    saveTokens(stored);
    req.session.instagramConnected = true;

    res.redirect('/dashboard.html?connected=instagram');
  } catch (err) {
    console.error('Instagram auth error:', err.message);
    res.redirect('/?error=instagram_failed');
  }
});

// ============================================================
// API ENDPOINTS
// ============================================================

// Get connection status
app.get('/api/status', (req, res) => {
  const tokens = loadTokens();
  res.json({
    youtube: !!tokens.youtube,
    instagram: !!tokens.instagram,
    youtubeProfile: tokens.youtube?.profile || null,
    instagramProfile: tokens.instagram?.profile || null,
    geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here')
  });
});

// Disconnect a platform
app.post('/api/disconnect', (req, res) => {
  const { platform } = req.body;
  const stored = loadTokens();
  delete stored[platform];
  saveTokens(stored);
  res.json({ success: true });
});

// Helper to dynamically read the logged-in YouTube channel's profile & top recent videos
async function getActiveChannelIntelligence() {
  const stored = loadTokens();
  if (!stored.youtube || !stored.youtube.tokens) return null;

  const profile = { ...(stored.youtube.profile || {}) };
  let recentTopics = [];

  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(stored.youtube.tokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Fetch channel details & uploads playlist
    const channelRes = await youtube.channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      mine: true
    });

    const ch = channelRes.data.items?.[0];
    if (ch) {
      profile.channelId = ch.id || profile.channelId;
      profile.channelName = ch.snippet?.title || profile.channelName;
      profile.country = ch.snippet?.country || 'IN';
      profile.description = ch.snippet?.description || '';
      profile.customUrl = ch.snippet?.customUrl || '';
      profile.subscribers = ch.statistics?.subscriberCount || profile.subscribers;
      profile.totalVideos = ch.statistics?.videoCount || profile.totalVideos;
      profile.viewCount = ch.statistics?.viewCount || profile.viewCount;

      const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
      if (uploadsPlaylistId) {
        const playlistRes = await youtube.playlistItems.list({
          part: ['snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: 6
        });
        recentTopics = (playlistRes.data.items || []).map(it => it.snippet?.title).filter(Boolean);
      }
    }
  } catch (err) {
    console.log('Channel intelligence notice:', err.message);
  }

  return {
    ...profile,
    recentVideoTitles: recentTopics
  };
}

// --- Channel Settings & Upload Defaults Management ---
const CHANNEL_SETTINGS_FILE = path.join(__dirname, 'channel_settings.json');

function loadChannelSettings(channelId) {
  try {
    if (fs.existsSync(CHANNEL_SETTINGS_FILE)) {
      const allSettings = JSON.parse(fs.readFileSync(CHANNEL_SETTINGS_FILE, 'utf8'));
      if (channelId && allSettings[channelId]) {
        return allSettings[channelId];
      }
    }
  } catch (e) {}
  return null;
}

function saveChannelSettings(channelId, settings) {
  try {
    let allSettings = {};
    if (fs.existsSync(CHANNEL_SETTINGS_FILE)) {
      allSettings = JSON.parse(fs.readFileSync(CHANNEL_SETTINGS_FILE, 'utf8'));
    }
    allSettings[channelId] = { ...(allSettings[channelId] || {}), ...settings, updatedAt: Date.now() };
    fs.writeFileSync(CHANNEL_SETTINGS_FILE, JSON.stringify(allSettings, null, 2), 'utf8');
    return allSettings[channelId];
  } catch (e) {
    console.warn('Could not save channel settings:', e.message);
  }
  return settings;
}

function resolveChannelDefaults(channelIntel, userProfile) {
  const channelId = channelIntel?.channelId || 'default';
  const saved = loadChannelSettings(channelId);
  if (saved && saved.isConfigured) {
    return saved;
  }

  const channelName = channelIntel?.channelName || userProfile?.name || 'Creator';
  const isUtkarsh = channelName.toLowerCase().includes('utkarsh') || channelId === 'UCTBcIzCe5jyMrvB-lIWU9XQ';

  if (isUtkarsh) {
    const utkarshDefaults = {
      channelId,
      channelName: 'Utkarsh FF',
      niche: 'Free Fire',
      instagram: 'https://www.instagram.com/ig.utkarshff/',
      whatsapp: 'https://whatsapp.com/channel/0029VbB0ULkIHphJBZodz41M',
      businessEmail: 'contact.akautkarsh@gmail.com',
      customLink: '',
      defaultHashtags: ['freefire', 'brrankedpush', 'freefireindia', 'freefiretips', 'utkarshff'],
      isConfigured: true
    };
    saveChannelSettings(channelId, utkarshDefaults);
    return utkarshDefaults;
  }

  // Auto-detect bio links for any new channel
  const bio = channelIntel?.description || '';
  const emailMatch = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const instaMatch = bio.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_\.\-]+)/i) || bio.match(/(?:insta(?:gram)?|ig)\s*[:\-@]\s*([a-zA-Z0-9_\.\-]+)/i);
  const waMatch = bio.match(/(?:https?:\/\/)?(?:chat\.|www\.)?whatsapp\.com\/(?:channel\/|chat\/)?[a-zA-Z0-9_\-]+/i);

  // Auto-detect niche from recent video titles
  const recentTitles = (channelIntel?.recentVideoTitles || []).join(' ').toLowerCase();
  let detectedNiche = 'Gaming';
  if (recentTitles.includes('free fire')) detectedNiche = 'Free Fire';
  else if (recentTitles.includes('bgmi') || recentTitles.includes('pubg')) detectedNiche = 'BGMI';
  else if (recentTitles.includes('minecraft')) detectedNiche = 'Minecraft';
  else if (recentTitles.includes('recipe') || recentTitles.includes('kitchen') || recentTitles.includes('cook')) detectedNiche = 'Cooking';
  else if (recentTitles.includes('tech') || recentTitles.includes('unboxing') || recentTitles.includes('review') || recentTitles.includes('iphone') || recentTitles.includes('android')) detectedNiche = 'Technology';
  else if (recentTitles.includes('vlog') || recentTitles.includes('travel')) detectedNiche = 'Vlogs';
  else if (recentTitles.includes('fitness') || recentTitles.includes('workout') || recentTitles.includes('gym')) detectedNiche = 'Fitness';

  const cleanHandle = (channelIntel?.customUrl || channelName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanNicheTag = detectedNiche.toLowerCase().replace(/[^a-z0-9]/g, '');

  const newDefaults = {
    channelId,
    channelName,
    niche: detectedNiche,
    instagram: instaMatch ? (instaMatch[0].startsWith('http') ? instaMatch[0] : `https://www.instagram.com/${instaMatch[1]}`) : '',
    whatsapp: waMatch ? (waMatch[0].startsWith('http') ? waMatch[0] : `https://${waMatch[0]}`) : '',
    businessEmail: emailMatch ? emailMatch[0] : (userProfile?.email || ''),
    customLink: '',
    defaultHashtags: [cleanHandle, cleanNicheTag, 'trending', 'viral', 'youtube'].filter(Boolean),
    isConfigured: false
  };

  saveChannelSettings(channelId, newDefaults);
  return newDefaults;
}

function buildConnectWithMeBlock(defaults) {
  const lines = [];
  if (defaults.instagram) {
    lines.push(`  • Instagram - ${defaults.instagram}`);
  }
  if (defaults.whatsapp) {
    lines.push(`  • WhatsApp Channel - ${defaults.whatsapp}`);
  }
  if (defaults.businessEmail) {
    lines.push(`  • Business Email - ${defaults.businessEmail}`);
  }
  if (defaults.customLink) {
    lines.push(`  • More Info - ${defaults.customLink}`);
  }

  if (!lines.length) {
    if (defaults.businessEmail) {
      lines.push(`  • Business Email - ${defaults.businessEmail}`);
    } else {
      lines.push(`  • Contact - Inquire via channel About section`);
    }
  }

  return `🔥 Connect With Me:\n${lines.join('\n')}`;
}

// --- YouTube Audience History & Topic Research Engine ---
const CACHE_AUDIENCE_FILE = path.join(__dirname, 'cache_audience_history.json');
const CACHE_TOPIC_FILE = path.join(__dirname, 'cache_topic_research.json');

function loadJsonCache(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.warn(`Could not read cache file ${file}:`, e.message);
  }
  return {};
}

function saveJsonCache(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`Could not write cache file ${file}:`, e.message);
  }
}

function isUsefulViewerComment(text) {
  if (!text || text.length < 8 || text.length > 250) return false;
  const lower = text.toLowerCase();
  const spamKeywords = [
    'alok dedo', 'giveaway', '1 like =', 'one like =', 'diamonds please',
    'sub to me', 'support me', 'who is watching in 202', 'free diamonds', 'gift me'
  ];
  return !spamKeywords.some(w => lower.includes(w));
}

// 1. Scan the creator's own audience history (top performing videos & top comments)
async function getChannelAudienceHistory(youtube, profile) {
  const cache = loadJsonCache(CACHE_AUDIENCE_FILE);
  const channelId = profile?.channelId || 'UCTBcIzCe5jyMrvB-lIWU9XQ';
  const now = Date.now();

  // Cache for 12 hours
  if (cache[channelId] && (now - cache[channelId].timestamp < 12 * 60 * 60 * 1000)) {
    return cache[channelId].data;
  }

  const result = {
    topVideos: [],
    audienceQuestions: []
  };

  try {
    const channelRes = await youtube.channels.list({
      part: ['contentDetails', 'statistics'],
      id: [channelId]
    });

    const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return result;

    // Fetch recent uploads (1 unit)
    const playlistRes = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults: 15
    });

    const videoIds = (playlistRes.data.items || []).map(it => it.contentDetails?.videoId).filter(Boolean);
    if (!videoIds.length) return result;

    // Fetch video statistics (1 unit)
    const videosRes = await youtube.videos.list({
      part: ['snippet', 'statistics'],
      id: videoIds
    });

    const videos = (videosRes.data.items || []).map(v => ({
      id: v.id,
      title: v.snippet?.title || '',
      tags: v.snippet?.tags || [],
      description: (v.snippet?.description || '').substring(0, 300),
      viewCount: Number(v.statistics?.viewCount || 0),
      likeCount: Number(v.statistics?.likeCount || 0),
      commentCount: Number(v.statistics?.commentCount || 0)
    })).sort((a, b) => b.viewCount - a.viewCount);

    result.topVideos = videos.slice(0, 10);

    // Mine real subscriber questions from top 2 videos (1 unit each)
    const questions = [];
    for (const vid of videos.slice(0, 2)) {
      try {
        const commentsRes = await youtube.commentThreads.list({
          part: ['snippet'],
          videoId: vid.id,
          order: 'relevance',
          maxResults: 10
        });

        (commentsRes.data.items || []).forEach(item => {
          const commentText = item.snippet?.topLevelComment?.snippet?.textDisplay || '';
          const clean = commentText.replace(/<[^>]*>/g, '').trim();
          if (isUsefulViewerComment(clean)) {
            questions.push(clean);
          }
        });
      } catch (cErr) {}
    }
    result.audienceQuestions = questions.slice(0, 5);

    cache[channelId] = { timestamp: now, data: result };
    saveJsonCache(CACHE_AUDIENCE_FILE, cache);
  } catch (err) {
    console.warn('Audience history notice:', err.message);
  }

  return result;
}

// 2. Scan YouTube-wide topic intelligence (top competing videos, views, descriptions, comments)
async function getYouTubeTopicIntelligence(youtube, query, niche) {
  if (!query || !query.trim()) return null;
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().substring(0, 50);
  const cache = loadJsonCache(CACHE_TOPIC_FILE);
  const now = Date.now();

  const cleanNiche = (niche || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cacheKey = `${cleanQuery}_${cleanNiche}`;

  // Cache for 6 hours
  if (cache[cacheKey] && (now - cache[cacheKey].timestamp < 6 * 60 * 60 * 1000)) {
    return cache[cacheKey].data;
  }

  const result = {
    query: cleanQuery,
    competingVideos: [],
    realViewerQuestions: [],
    popularTags: []
  };

  try {
    // Only contextualize with niche if query doesn't already contain it
    let searchQuery = cleanQuery;
    if (niche && !cleanQuery.includes(niche.toLowerCase())) {
      searchQuery = `${cleanQuery} ${niche}`.trim();
    }

    // Search top 4 videos for this topic (100 units)
    const searchRes = await youtube.search.list({
      part: ['id'],
      q: searchQuery,
      type: ['video'],
      order: 'relevance',
      maxResults: 4
    });

    const videoIds = (searchRes.data.items || []).map(it => it.id?.videoId).filter(Boolean);
    if (!videoIds.length) return null;

    // Fetch video details (1 unit)
    const videosRes = await youtube.videos.list({
      part: ['snippet', 'statistics'],
      id: videoIds
    });

    const allTags = new Set();
    result.competingVideos = (videosRes.data.items || []).map(v => {
      (v.snippet?.tags || []).forEach(t => allTags.add(t));
      return {
        id: v.id,
        title: v.snippet?.title,
        viewCount: Number(v.statistics?.viewCount || 0),
        likeCount: Number(v.statistics?.likeCount || 0),
        commentCount: Number(v.statistics?.commentCount || 0)
      };
    }).sort((a, b) => b.viewCount - a.viewCount);

    result.popularTags = Array.from(allTags).slice(0, 20);

    // Mine real questions from the #1 highest-viewed video (1 unit)
    const topVid = result.competingVideos[0];
    if (topVid) {
      try {
        const commentsRes = await youtube.commentThreads.list({
          part: ['snippet'],
          videoId: topVid.id,
          order: 'relevance',
          maxResults: 10
        });

        const viewerQuestions = [];
        (commentsRes.data.items || []).forEach(item => {
          const commentText = item.snippet?.topLevelComment?.snippet?.textDisplay || '';
          const clean = commentText.replace(/<[^>]*>/g, '').trim();
          if (isUsefulViewerComment(clean)) {
            viewerQuestions.push(clean);
          }
        });
        result.realViewerQuestions = viewerQuestions.slice(0, 5);
      } catch (cErr) {}
    }

    cache[cacheKey] = { timestamp: now, data: result };
    saveJsonCache(CACHE_TOPIC_FILE, cache);
  } catch (err) {
    console.warn('YouTube topic research notice:', err.message);
  }

  return result;
}

// Get logged-in channel intelligence
app.get('/api/channel/intel', async (req, res) => {
  const intel = await getActiveChannelIntelligence();
  res.json({ success: true, channel: intel });
});

// Get channel settings & defaults
app.get('/api/channel/settings', async (req, res) => {
  const channelIntel = await getActiveChannelIntelligence();
  const storedTokens = loadTokens();
  const userProfile = storedTokens.youtube?.profile || null;
  const channelDefaults = resolveChannelDefaults(channelIntel, userProfile);
  res.json({ success: true, settings: channelDefaults });
});

// Save channel settings & defaults
app.post('/api/channel/settings', express.json(), async (req, res) => {
  const { channelId, channelName, niche, instagram, whatsapp, businessEmail, customLink, defaultHashtags } = req.body;
  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  const tagsArray = Array.isArray(defaultHashtags)
    ? defaultHashtags.map(t => t.replace(/^#/, '').trim()).filter(Boolean)
    : (defaultHashtags || '').split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);

  const updated = saveChannelSettings(channelId, {
    channelName,
    niche,
    instagram,
    whatsapp,
    businessEmail,
    customLink,
    defaultHashtags: tagsArray,
    isConfigured: true
  });
  res.json({ success: true, settings: updated });
});

// ============================================================
// 3. YOUTUBE RESEARCH RADAR (100% YOUTUBE END-TO-END)
// ============================================================
const CACHE_RADAR_FILE = path.join(__dirname, 'cache_research_radar.json');

function extractChannelAudiencePillars(audienceHistory, channelNiche) {
  const topVideos = audienceHistory?.topVideos || [];
  const allTitlesText = topVideos.map(v => v.title || '').join(' ').toLowerCase();
  const allTagsText = topVideos.flatMap(v => v.tags || []).join(' ').toLowerCase();
  const combinedContext = `${allTitlesText} ${allTagsText}`;
  const cleanNiche = channelNiche || 'Free Fire';

  const candidatePillars = [];

  // 1. Rank Push & Grandmaster
  if (combinedContext.includes('grandmaster') || combinedContext.includes('rank') || combinedContext.includes('push') || combinedContext.includes('season')) {
    candidatePillars.push({
      id: 'rank_push',
      label: '🏆 Grandmaster & BR Rank Push',
      query: `${cleanNiche} Grandmaster rank push tips solo`
    });
  }

  // 2. Skill Combo & Character Combinations
  if (combinedContext.includes('skill') || combinedContext.includes('combo') || combinedContext.includes('character') || combinedContext.includes('alok') || combinedContext.includes('orion') || combinedContext.includes('tatsuya')) {
    candidatePillars.push({
      id: 'skill_combo',
      label: '⚡ Secret Skill Combos & Abilities',
      query: `${cleanNiche} best character skill combination br rank`
    });
  }

  // 3. Solo Win & Booyah Strategy
  if (combinedContext.includes('solo') || combinedContext.includes('strategy') || combinedContext.includes('booyah') || combinedContext.includes('bot lobby') || combinedContext.includes('survival')) {
    candidatePillars.push({
      id: 'solo_strategy',
      label: '🎯 Solo Win & Booyah Strategy',
      query: `${cleanNiche} solo rank push tips and tricks booyah strategy`
    });
  }

  // 4. Weapons & One-Tap Headshot / Sensitivity
  if (combinedContext.includes('headshot') || combinedContext.includes('m1887') || combinedContext.includes('woodpecker') || combinedContext.includes('shotgun') || combinedContext.includes('mp40') || combinedContext.includes('sensitivity') || combinedContext.includes('gun')) {
    candidatePillars.push({
      id: 'gun_mastery',
      label: '🔫 Headshot & Sensitivity Mastery',
      query: `${cleanNiche} one tap headshot sensitivity settings trick`
    });
  }

  // 5. CS Rank & Clash Squad
  if (combinedContext.includes('cs rank') || combinedContext.includes('clash squad') || combinedContext.includes('cs ')) {
    candidatePillars.push({
      id: 'cs_rank',
      label: '💥 CS Rank Push & Clash Squad',
      query: `${cleanNiche} cs rank push tips and tricks master`
    });
  }

  // Fallback for non-gaming niches
  if (!candidatePillars.length) {
    candidatePillars.push(
      { id: 'trending_topics', label: '🔥 Breakout Topics', query: `${cleanNiche} viral trending tips` },
      { id: 'beginner_guide', label: '📚 Tutorials & Guides', query: `${cleanNiche} complete tutorial guide for beginners` },
      { id: 'hacks_secrets', label: '⚡ Hacks & Secret Tricks', query: `${cleanNiche} secret tips and tricks` }
    );
  }

  return [
    { id: 'all', label: '🔥 All Audience Pillars', query: '' },
    ...candidatePillars
  ];
}

function isForeignLanguage(text, country = 'IN') {
  if (country === 'IN') {
    // 1. Vietnamese diacritics
    const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    if (vietnameseRegex.test(text)) return true;

    // 2. Distinctive foreign non-English phrases
    const foreignPhrases = [
      'thử thách', 'đăng ký kênh', 'chào các bạn', 'anh em xem clip',
      'vcl', 'partida completa', 'jogando free fire',
      'final inesperado', 'diamantes por kill', 'desafio de la',
      'subtitulado', 'novo evento', 'melhor sensibilidade', 'dicas para'
    ];
    const lower = text.toLowerCase();
    if (foreignPhrases.some(p => lower.includes(p))) return true;

    // 3. Non-Latin scripts
    const nonLatinScripts = /[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u4E00-\u9FFF\uAC00-\uD7AF]/;
    if (nonLatinScripts.test(text)) return true;
  }
  return false;
}

function calculateAudienceAffinity(video, audienceHistory, channelNiche, channelCountry = 'IN') {
  const fullText = `${video.title} ${video.description} ${(video.tags || []).join(' ')}`.toLowerCase();

  // 1. Language check
  if (isForeignLanguage(fullText, channelCountry)) return { score: 0, reason: 'Foreign language' };

  // 2. Anti-Spam check
  const spamKeywords = [
    'going ball', 'going balls', 'ball game', 'roller ball', 'color pop',
    'puzzle game', 'subway surf', 'roblox', 'satisfying slime', 'asmr eating',
    'minecraft build', 'gta 5 funny', 'impossible 🍷🗿', 'reaction andra st',
    'so emotional 🥺'
  ];
  if (spamKeywords.some(s => fullText.includes(s))) return { score: 0, reason: 'Spam game or meme' };

  // 3. Esports / 4-hour broadcast VOD filter
  const titleLower = (video.title || '').toLowerCase();
  const channelLower = (video.channelTitle || '').toLowerCase();
  if (channelLower.includes('esports') || channelLower.includes('official')) {
    if (titleLower.includes('knockout stage') || titleLower.includes('day 1') || titleLower.includes('day 2') || titleLower.includes('grand final')) {
      return { score: 0, reason: 'Official tournament broadcast' };
    }
  }

  // 4. Must be relevant to primary niche
  const cleanNiche = (channelNiche || 'Free Fire').toLowerCase();
  const isNicheMatch = fullText.includes(cleanNiche) ||
                       fullText.includes('freefire') ||
                       fullText.includes('garena') ||
                       fullText.includes('br rank') ||
                       fullText.includes('cs rank');
  if (!isNicheMatch) return { score: 0, reason: 'Not in niche' };

  // 5. Score alignment against channel's proven audience vocabulary
  let affinityScore = 55; // Base score for verified niche video
  let matchedPillar = '🔥 High-Demand Topic';
  let matchReason = 'High viewer demand in your niche';

  const rankTokens = ['grandmaster', 'rank push', 'br rank', 'season', 'booyah', 'heroic', 'master done', 'rank'];
  const comboTokens = ['skill combo', 'character combination', 'secret combo', 'character skill', 'unfair combo', 'best skill', 'combo'];
  const soloTokens = ['solo', 'bot lobby', 'win every', 'survival', 'zone', 'strategy', '1v4', 'clutch'];
  const weaponTokens = ['headshot', 'sensitivity', 'one tap', 'm1887', 'mp40', 'woodpecker', 'gun skin', 'aim', 'setting'];
  const csTokens = ['cs rank', 'clash squad', 'cs '];

  if (comboTokens.some(t => fullText.includes(t))) {
    affinityScore += 35;
    matchedPillar = '⚡ Secret Skill Combo';
    matchReason = 'Matches your 10k+ viewed Secret Skill Combo format';
  } else if (rankTokens.some(t => fullText.includes(t))) {
    affinityScore += 32;
    matchedPillar = '🏆 Grandmaster Rank Push';
    matchReason = 'Matches your 20k+ viewed Grandmaster Rank Push benchmark';
  } else if (soloTokens.some(t => fullText.includes(t))) {
    affinityScore += 28;
    matchedPillar = '🎯 Solo Booyah Strategy';
    matchReason = 'Matches your 8.5k+ viewed Solo Win Strategy format';
  } else if (weaponTokens.some(t => fullText.includes(t))) {
    affinityScore += 26;
    matchedPillar = '🔫 Headshot & Sensitivity';
    matchReason = 'Matches high-performing weapon mastery & sensitivity theme';
  } else if (csTokens.some(t => fullText.includes(t))) {
    affinityScore += 25;
    matchedPillar = '💥 CS Rank Mastery';
    matchReason = 'Matches your 5k+ viewed CS Rank Strategy format';
  }

  // Bonus for actionable words
  const actionHooks = ['tips', 'tricks', 'secret', 'reveal', 'guide', 'hidden', 'update', 'working', 'booyah'];
  if (actionHooks.some(h => fullText.includes(h))) {
    affinityScore += 8;
  }

  const finalAffinity = Math.min(99, affinityScore);
  if (finalAffinity < 60) return { score: 0, reason: 'Low audience alignment' };

  return {
    score: finalAffinity,
    pillar: matchedPillar,
    reason: matchReason
  };
}

async function getYouTubeResearchRadar(youtube, options = {}) {
  const {
    niche = 'Free Fire',
    query = '',
    pillar = 'all',
    timeframe = '7d', // '24h', '7d', '30d', 'all'
    format = 'all',   // 'all', 'shorts', 'long'
    refresh = false,
    audienceHistory = null,
    channelIntel = null
  } = options;

  const cleanQuery = (query || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const cleanNiche = (niche || 'Free Fire').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const channelCountry = channelIntel?.country || 'IN';
  const cacheKey = `${cleanNiche}_${cleanQuery}_${pillar}_${timeframe}_${format}_${channelCountry}`;

  const cache = loadJsonCache(CACHE_RADAR_FILE);
  const now = Date.now();

  // 4-hour cache TTL unless user explicitly hits refresh
  if (!refresh && cache[cacheKey] && (now - cache[cacheKey].timestamp < 4 * 60 * 60 * 1000)) {
    return cache[cacheKey].data;
  }

  // Derive audience pillars based on real top videos
  const pillars = extractChannelAudiencePillars(audienceHistory, cleanNiche);
  const selectedPillar = pillars.find(p => p.id === pillar);

  // Build target search queries
  let targetQueries = [];
  if (cleanQuery) {
    targetQueries = [`${cleanNiche} ${cleanQuery}`];
  } else if (selectedPillar && selectedPillar.id !== 'all' && selectedPillar.query) {
    targetQueries = [selectedPillar.query];
  } else {
    // Top 3 audience grounded queries for "All Pillars"
    targetQueries = [
      `${cleanNiche} Grandmaster rank push tips solo`,
      `${cleanNiche} best character skill combination br rank`,
      `${cleanNiche} solo vs squad booyah strategy gameplay`
    ];
  }

  // Published after timestamp
  let publishedAfter = null;
  if (timeframe === '24h') {
    publishedAfter = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  } else if (timeframe === '7d') {
    publishedAfter = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (timeframe === '30d') {
    publishedAfter = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const candidateVideoIds = [];

    for (const tQuery of targetQueries) {
      let finalQuery = tQuery;
      if (format === 'shorts' && !finalQuery.toLowerCase().includes('#shorts')) {
        finalQuery = `${finalQuery} #shorts`;
      }

      const searchParams = {
        part: ['id'],
        q: finalQuery,
        type: ['video'],
        regionCode: channelCountry,
        order: 'viewCount', // Order by viewCount to discover the highest-viewed videos exceeding 80k-100k+
        maxResults: targetQueries.length > 1 ? 25 : 50
      };

      if (format === 'long') {
        searchParams.videoDuration = 'medium';
      } else if (format === 'shorts') {
        searchParams.videoDuration = 'short';
      }

      if (publishedAfter) {
        searchParams.publishedAfter = publishedAfter;
      }

      const searchRes = await youtube.search.list(searchParams);
      (searchRes.data.items || []).forEach(it => {
        const vId = it.id?.videoId;
        if (vId && !candidateVideoIds.includes(vId)) {
          candidateVideoIds.push(vId);
        }
      });
    }

    if (!candidateVideoIds.length) {
      return { videos: [], niche: cleanNiche, pillars, totalFound: 0 };
    }

    // Fetch video details in chunks of 50 (up to 100 candidate videos)
    const rawVideos = [];
    const videoChunks = [];
    for (let i = 0; i < candidateVideoIds.length && i < 100; i += 50) {
      videoChunks.push(candidateVideoIds.slice(i, i + 50));
    }
    for (const chunk of videoChunks) {
      const videosRes = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: chunk
      });
      rawVideos.push(...(videosRes.data.items || []));
    }

    const channelIds = Array.from(new Set(rawVideos.map(v => v.snippet?.channelId).filter(Boolean)));

    // Fetch channel subscriber counts for accurate outlier calculation in chunks of 50
    let channelSubsMap = {};
    if (channelIds.length) {
      try {
        const channelChunks = [];
        for (let i = 0; i < channelIds.length; i += 50) {
          channelChunks.push(channelIds.slice(i, i + 50));
        }
        for (const chChunk of channelChunks) {
          const channelsRes = await youtube.channels.list({
            part: ['statistics'],
            id: chChunk
          });
          (channelsRes.data.items || []).forEach(ch => {
            channelSubsMap[ch.id] = Number(ch.statistics?.subscriberCount || 0);
          });
        }
      } catch (chErr) {}
    }

    // Process and filter each video against audience affinity, spam & language
    const processedVideos = [];
    for (const v of rawVideos) {
      const viewCount = Number(v.statistics?.viewCount || 0);
      const likeCount = Number(v.statistics?.likeCount || 0);
      const commentCount = Number(v.statistics?.commentCount || 0);
      const channelId = v.snippet?.channelId;
      const channelSubscribers = channelSubsMap[channelId] || 0;

      // STRICT REQUIREMENT: Do not consider videos with less than 80k-100k views
      if (viewCount < 80000) {
        continue;
      }

      // Duration check
      const durationStr = v.contentDetails?.duration || '';
      // Skip videos longer than 35 minutes (e.g. 4-hour live tournament broadcasts)
      if (durationStr.includes('H') || durationStr.includes('PT4') || durationStr.includes('PT5')) {
        const minMatch = durationStr.match(/PT(\d+)M/);
        if (durationStr.includes('H') || (minMatch && Number(minMatch[1]) > 35)) {
          continue;
        }
      }

      const isShort = durationStr.includes('PT') && !durationStr.includes('H') &&
        (durationStr.endsWith('S') && !durationStr.includes('M') || durationStr.includes('PT1M0') || durationStr === 'PT1M');
      const isShortTitle = (v.snippet?.title || '').toLowerCase().includes('#shorts') || (v.snippet?.description || '').toLowerCase().includes('#shorts');

      // Apply format filter
      if (format === 'shorts' && !isShort && !isShortTitle) continue;
      if (format === 'long' && (isShort || isShortTitle)) continue;

      const tags = (v.snippet?.tags || []).slice(0, 15);
      const videoCandidate = {
        title: v.snippet?.title || '',
        description: (v.snippet?.description || '').substring(0, 300),
        channelTitle: v.snippet?.channelTitle || '',
        tags
      };

      // Strict Audience Affinity, Language & Anti-Spam Check
      const affinity = calculateAudienceAffinity(videoCandidate, audienceHistory, cleanNiche, channelCountry);
      if (affinity.score === 0) {
        continue;
      }

      // Published time calculation
      const pubDate = new Date(v.snippet?.publishedAt || now);
      const hoursAgo = Math.max(0.5, (now - pubDate.getTime()) / (1000 * 60 * 60));

      // View velocity (views per hour)
      const viewVelocity = Math.round(viewCount / hoursAgo);

      // Outlier Multiplier: views compared to channel size (baseline 5,000 for zero/small channels)
      const effectiveSubs = Math.max(channelSubscribers, 5000);
      const outlierScore = parseFloat((viewCount / effectiveSubs).toFixed(1));

      // Engagement rate
      const engagementRate = viewCount > 0 ? parseFloat(((likeCount + commentCount) / viewCount * 100).toFixed(1)) : 0;

      // Thumbnail
      const thumbs = v.snippet?.thumbnails || {};
      const thumbnail = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '';

      processedVideos.push({
        id: v.id,
        videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet?.title || '',
        description: (v.snippet?.description || '').substring(0, 300),
        channelId: channelId,
        channelTitle: v.snippet?.channelTitle || 'Creator',
        channelSubscribers,
        viewCount,
        likeCount,
        commentCount,
        publishedAt: v.snippet?.publishedAt,
        hoursAgo: Math.round(hoursAgo),
        viewVelocity,
        outlierScore,
        engagementRate,
        audienceAffinity: affinity.score,
        matchedPillar: affinity.pillar,
        matchReason: affinity.reason,
        isShort: isShort || isShortTitle,
        duration: durationStr.replace('PT', '').toLowerCase(),
        thumbnail,
        tags
      });
    }

    // Sort by Audience Affinity + Outlier Score + Velocity
    processedVideos.sort((a, b) => {
      const scoreA = (a.audienceAffinity * 100) + (a.outlierScore >= 1.5 ? a.outlierScore * 10 : 0) + Math.min(a.viewVelocity / 100, 50);
      const scoreB = (b.audienceAffinity * 100) + (b.outlierScore >= 1.5 ? b.outlierScore * 10 : 0) + Math.min(b.viewVelocity / 100, 50);
      return scoreB - scoreA;
    });

    // Fetch top-liked questions for top 3 breakout videos
    for (const vid of processedVideos.slice(0, 3)) {
      try {
        const commRes = await youtube.commentThreads.list({
          part: ['snippet'],
          videoId: vid.id,
          order: 'relevance',
          maxResults: 6
        });
        const qList = [];
        (commRes.data.items || []).forEach(it => {
          const text = (it.snippet?.topLevelComment?.snippet?.textDisplay || '').replace(/<[^>]*>/g, '').trim();
          if (isUsefulViewerComment(text) && (text.includes('?') || text.toLowerCase().includes('how') || text.toLowerCase().includes('trick'))) {
            qList.push(text);
          }
        });
        vid.topViewerQuestions = qList.slice(0, 3);
      } catch (err) {}
    }

    // 1. High-Velocity Outliers: Videos that gained abnormal views in less time compared to normal (NO ARTIFICIAL LIMIT)
    const velocityOutliers = processedVideos
      .filter(v => v.outlierScore >= 1.3 || v.viewVelocity >= 300)
      .slice()
      .sort((a, b) => {
        const scoreA = (a.outlierScore * 1000) + a.viewVelocity;
        const scoreB = (b.outlierScore * 1000) + b.viewVelocity;
        return scoreB - scoreA;
      });

    // 2. Channel Audience Grounded Videos: strictly aligned to channel's upload history (NO ARTIFICIAL LIMIT)
    const audienceVideos = processedVideos
      .filter(v => v.audienceAffinity >= 65)
      .slice()
      .sort((a, b) => {
        const scoreA = (a.audienceAffinity * 100) + (a.outlierScore >= 1.5 ? a.outlierScore * 10 : 0) + Math.min(a.viewVelocity / 100, 50);
        const scoreB = (b.audienceAffinity * 100) + (b.outlierScore >= 1.5 ? b.outlierScore * 10 : 0) + Math.min(b.viewVelocity / 100, 50);
        return scoreB - scoreA;
      });

    // 3. Beyond Relevancy: Real-Time YouTube Trending Gaming Chart (NO ARTIFICIAL LIMIT)
    let trendingBeyond = [];
    try {
      const trendingRes = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        chart: 'mostPopular',
        videoCategoryId: '20', // Gaming
        regionCode: channelCountry,
        maxResults: 25
      });
      (trendingRes.data.items || []).forEach(v => {
        const dStr = v.contentDetails?.duration || '';
        const minMatch = dStr.match(/PT(\d+)M/);
        if (dStr.includes('H') || (minMatch && Number(minMatch[1]) > 45)) return;

        const vCount = Number(v.statistics?.viewCount || 0);
        // STRICT REQUIREMENT: Do not consider trending videos with less than 80k-100k views
        if (vCount < 80000) return;

        const lCount = Number(v.statistics?.likeCount || 0);
        const tTitle = v.snippet?.title || '';
        const thumbs = v.snippet?.thumbnails || {};
        const thumb = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || '';

        let adaptHook = 'Adapt this trending curiosity/challenge concept into a high-stakes Free Fire challenge!';
        const tLower = tTitle.toLowerCase();
        if (tLower.includes('poor') || tLower.includes('rich') || tLower.includes('noob') || tLower.includes('pro')) {
          adaptHook = 'Noob Account (0 Diamonds) vs Richest Account in Free Fire BR Rank!';
        } else if (tLower.includes('mine') || tLower.includes('1 trillion') || tLower.includes('100') || tLower.includes('block')) {
          adaptHook = 'Free Fire But Every Elimination Multiplies My Loot & Gun Skin by 100x!';
        } else if (tLower.includes('son') || tLower.includes('playing with') || tLower.includes('random') || tLower.includes('girl')) {
          adaptHook = 'Playing with a Random 8-Year Old in Grandmaster Lobby... He Did THIS!';
        } else if (tLower.includes('mafia') || tLower.includes('army') || tLower.includes('busted')) {
          adaptHook = 'Recruiting a Secret Army of Random Players to Push Grandmaster!';
        } else if (tLower.includes('escape') || tLower.includes('house') || tLower.includes('survival')) {
          adaptHook = 'Can You Escape the Shrinking Zone with NO Medkits or Vehicles?!';
        } else if (tLower.includes('1v4') || tLower.includes('clutch') || tLower.includes('headshot')) {
          adaptHook = 'Clutching Against Region Top 1 Squad with ONLY Desert Eagle!';
        }

        const tPubDate = new Date(v.snippet?.publishedAt || now);
        const tHoursAgo = Math.max(0.5, (now - tPubDate.getTime()) / (1000 * 60 * 60));

        trendingBeyond.push({
          id: v.id,
          videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
          title: tTitle,
          channelTitle: v.snippet?.channelTitle || 'Trending Creator',
          viewCount: vCount,
          likeCount: lCount,
          thumbnail: thumb,
          duration: dStr.replace('PT', '').toLowerCase(),
          publishedAt: v.snippet?.publishedAt,
          hoursAgo: Math.round(tHoursAgo),
          adaptationHook: adaptHook,
          isTrending: true
        });
      });
    } catch (tErr) {
      console.warn('Trending beyond niche notice:', tErr.message);
    }

    const radarResult = {
      niche: cleanNiche,
      pillars,
      activePillar: pillar,
      timeframe,
      format,
      totalFound: processedVideos.length,
      videos: processedVideos,
      velocityOutliers,
      audienceVideos,
      trendingBeyond,
      cachedAt: now
    };

    cache[cacheKey] = { timestamp: now, data: radarResult };
    saveJsonCache(CACHE_RADAR_FILE, cache);

    return radarResult;
  } catch (err) {
    console.error('Research Radar Error:', err.message);
    throw err;
  }
}

// GET /api/research/radar
app.get('/api/research/radar', async (req, res) => {
  const stored = loadTokens();
  if (!stored.youtube || !stored.youtube.tokens) {
    return res.status(401).json({ error: 'Please connect your YouTube account first' });
  }

  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(stored.youtube.tokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const channelIntel = await getActiveChannelIntelligence();
    const userProfile = stored.youtube?.profile || null;
    const channelDefaults = resolveChannelDefaults(channelIntel, userProfile);
    const audienceHistory = await getChannelAudienceHistory(youtube, channelIntel);

    const niche = req.query.niche || channelDefaults.niche || 'Free Fire';
    const query = req.query.query || '';
    const pillar = req.query.pillar || 'all';
    const timeframe = req.query.timeframe || '7d';
    const format = req.query.format || 'all';
    const refresh = req.query.refresh === 'true';

    const data = await getYouTubeResearchRadar(youtube, {
      niche,
      query,
      pillar,
      timeframe,
      format,
      refresh,
      audienceHistory,
      channelIntel
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Radar endpoint error:', err.message);
    res.status(500).json({ error: 'Failed to scan YouTube trends: ' + err.message });
  }
});

// POST /api/research/remix
app.post('/api/research/remix', express.json(), async (req, res) => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { title, channelTitle, tags, niche } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Video title is required' });
  }

  try {
    const channelIntel = await getActiveChannelIntelligence();
    const storedTokens = loadTokens();
    const userProfile = storedTokens.youtube?.profile || null;
    const channelDefaults = resolveChannelDefaults(channelIntel, userProfile);
    const myChannelName = channelDefaults.channelName || 'Creator';
    const myNiche = channelDefaults.niche || niche || 'Gaming';

    const { GoogleGenAI } = require('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are an elite YouTube strategist. A competitor's video in the "${myNiche}" niche has gone viral on YouTube. Analyze it and formulate an adapted version for our channel "${myChannelName}".
Competitor Video Title: "${title}"
Competitor Channel: "${channelTitle || 'Competitor'}"
Competitor Tags: ${(tags || []).slice(0, 10).join(', ')}
Our Channel Name: "${myChannelName}"
Our Niche: "${myNiche}"

Generate:
1. whyItBlewUp: A 1-sentence breakdown of why this title & concept got high CTR on YouTube (curiosity gap, high stakes, or viewer desire).
2. remixAngles: Array of 3 distinct, high-CTR alternative video title hooks for our channel "${myChannelName}".
3. suggestedNotes: A 2-to-3 sentence storyline prompt ready to paste into our AI Notes box (mentioning key weapons/challenge/gameplay).
4. topRecommendedTags: Array of 8-10 best tags to use.

Format as JSON with keys: whyItBlewUp, remixAngles, suggestedNotes, topRecommendedTags`;

    let response;
    const models = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
    for (const m of models) {
      try {
        response = await genAI.models.generateContent({ model: m, contents: prompt });
        if (response?.text) break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!response?.text) throw new Error('AI Remix generation failed');
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json({ success: true, remix: JSON.parse(jsonMatch[0]) });
    } else {
      res.json({ success: true, remix: { whyItBlewUp: 'High demand viral topic', remixAngles: [title], suggestedNotes: title } });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Caption Generation
app.post('/api/generate', async (req, res) => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return res.status(400).json({ error: 'Gemini API key not configured' });
  }

  const { title, description, platform, tone, isShorts } = req.body;
  try {
    const { GoogleGenAI } = require('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 1. YouTube OAuth Client
    const stored = loadTokens();
    let youtube = null;
    if (stored.youtube && stored.youtube.tokens) {
      const oauth2Client = getOAuthClient();
      oauth2Client.setCredentials(stored.youtube.tokens);
      youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    }

    // 2. Channel Profile, Audience History & Dynamic Defaults
    const channelIntel = await getActiveChannelIntelligence();
    const userProfile = stored.youtube?.profile || null;
    const channelDefaults = resolveChannelDefaults(channelIntel, userProfile);

    const channelName = channelDefaults.channelName || channelIntel?.channelName || 'Creator';
    const channelSuffix = ` - ${channelName}`;
    const connectWithMeSection = buildConnectWithMeBlock(channelDefaults);
    const channelNiche = channelDefaults.niche || 'Gaming';
    const mandatoryTagsArray = channelDefaults.defaultHashtags && channelDefaults.defaultHashtags.length
      ? channelDefaults.defaultHashtags
      : [channelName.toLowerCase().replace(/[^a-z0-9]/g, ''), channelNiche.toLowerCase().replace(/[^a-z0-9]/g, '')];
    const mandatoryHashtagsText = mandatoryTagsArray.map(t => `#${t.replace(/^#/, '')}`).join('\n');

    let audienceHistory = null;
    if (youtube) {
      audienceHistory = await getChannelAudienceHistory(youtube, channelIntel);
    }

    // 3. YouTube-Wide Topic Research (Search, Viral Competitor Titles & Comments)
    const topicToSearch = (description && description.trim() && description !== 'Not provided')
      ? description.trim()
      : (title && title.trim() ? title.trim() : `${channelNiche} Best Strategy`);

    let topicIntel = null;
    if (youtube) {
      topicIntel = await getYouTubeTopicIntelligence(youtube, topicToSearch, channelNiche);
    }

    // Build Audience History Prompt Block
    let audienceHistoryPrompt = '';
    if (audienceHistory && audienceHistory.topVideos?.length) {
      audienceHistoryPrompt = `
================================================================================
YOUR CHANNEL AUDIENCE HISTORY (WHAT ${channelName.toUpperCase()} SUBSCRIBERS LOVE & WATCH MOST):
- Highest Viewed Videos On Your Channel:
${audienceHistory.topVideos.map(v => `  • "${v.title}" (${v.viewCount.toLocaleString()} views, ${v.likeCount.toLocaleString()} likes)`).join('\n')}
${audienceHistory.audienceQuestions?.length ? `- Top Subscriber Questions From Your Comments:
${audienceHistory.audienceQuestions.map(q => `  • "${q}"`).join('\n')}` : ''}
================================================================================
AUDIENCE GROUNDING RULE:
Mirror the exact high-performing hook patterns, content preferences, and subscriber relationship that made these top videos go viral on your channel!
`;
    }

    // Build YouTube-Wide Topic Research Block
    let youtubeResearchPrompt = '';
    if (topicIntel && topicIntel.competingVideos?.length) {
      youtubeResearchPrompt = `
================================================================================
LIVE YOUTUBE SEARCH & ENGAGEMENT RESEARCH ("${topicIntel.query}"):
- Top Competing Viral Videos on YouTube (Proven High-CTR Titles):
${topicIntel.competingVideos.map(v => `  • "${v.title}" (${v.viewCount.toLocaleString()} views, ${v.likeCount.toLocaleString()} likes)`).join('\n')}
${topicIntel.realViewerQuestions?.length ? `- Real Viewer Questions Found In YouTube Comments:
${topicIntel.realViewerQuestions.map(q => `  • "${q}"`).join('\n')}` : ''}
${topicIntel.popularTags?.length ? `- High-Velocity YouTube Algorithm Tags: ${topicIntel.popularTags.slice(0, 15).join(', ')}` : ''}
================================================================================
YOUTUBE RESEARCH GROUNDING RULE:
1. Model your title after these proven viral YouTube title hooks.
2. Directly answer these real viewer questions from comments inside your "📌 About This Video:" notes!
3. Incorporate these indexed YouTube search tags into your 3 keyword clusters.
`;
    }

    const uploadDefaultTemplateInfo = `
CRITICAL REQUIREMENT: YOU MUST USE THE USER'S FORMAT ONLY!
DO NOT invent extra sections. DO NOT add "[SECTION 1]", "[SECTION 2]", or any fake section tags!
Use ONLY the exact format provided below:

1. TITLE FORMAT:
   [Catchy High-CTR Video Title] 🤔${channelSuffix}

2. DESCRIPTION FORMAT (USE THIS EXACT STRUCTURE ONLY):
[Catchy High-CTR Video Title] 🤔${channelSuffix}

${connectWithMeSection}

📌 About This Video:

[Write rich, exciting, kid-friendly notes explaining the video, match breakdown / key highlights, equipment / tools / ingredients, strategies, and key moments. Address real viewer questions found in the YouTube comments. Written in clear, easy-to-read bullet notes and paragraphs that a 12-year-old kid understands. ~1,600 to 1,900 characters]

🎯 Keywords Related To Video:
[An extensive, comprehensive list of 40-50 keywords and phrases directly related to the video, highlights, tools, and main subjects. ~900 to 1,000 characters]

🔎 Keywords Related To Search Intent:
[An extensive, comprehensive list of 40-50 high-intent search queries that viewers type in the YouTube search bar for this topic. ~900 to 1,000 characters]

⚡ Keywords Related To ${channelNiche} Updates & Trends:
[An extensive, comprehensive list of 40-50 keywords covering the latest ${channelNiche} updates, current season/events, features, and trending topics. ~900 to 1,000 characters]

${mandatoryHashtagsText}
`;

    const toneAndVocabularyRules = `
CRITICAL LENGTH & VOCABULARY RULES:

1. LENGTH REQUIREMENT (STRICTLY 4,500 TO 4,800 CHARACTERS):
   - YouTube allows up to 5,000 characters.
   - The total caption MUST be between 4,500 and 4,800 characters in total length.
   - Expand the notes and provide 40-50 full keywords in each of the 3 keyword categories so the total character count is at least 4,500 characters.
   - Do NOT stop early, and do NOT exceed 4,850 characters.

2. TONE & VOCABULARY (STRICT 12-YEAR-OLD HUMAN GAMER / CREATOR TALK):
   - Every single sentence must be easily understood by a 12-year-old kid.
   - Punchy, exciting, energetic sentences.
   - STRICTLY BANNED ROBOTIC AI WORDS:
     "delve", "tapestry", "embark", "testament", "transformative", "unlock", "plethora", "dive deep", "crucial", "realm", "meticulous", "game-changer", "furthermore", "moreover", "in conclusion", "beacon", "vital", "paramount", "endeavor", "foster", "pivotal", "nuanced", "journey", "reclaiming", "burnout psychology", "ever-evolving", "elevate", "mastering", "unleash".
   - Sound like a real passionate ${channelNiche} creator talking with their community and friends!
`;

    const shortsInstructions = isShorts ? `
THIS IS A YOUTUBE SHORT:
- Title must be VIRAL, punchy, simple, UNDER 50 CHARACTERS with an emoji and #Shorts.
- Description should follow the exact upload default format (reaching 2,500 to 3,500 characters so the Short ranks at the top of YouTube Search!).
- Alternative titles must be 3 ultra-catchy hooks.
` : `
THIS IS A LONG-FORM YOUTUBE VIDEO:
- Title must follow: [High CTR Title] 🤔${channelSuffix}
- Description MUST be between 4,500 and 4,800 characters following ONLY the user's Upload Default format!
- Alternative titles must be 3 catchy, high-CTR options following the format.
`;

    const creatorNotes = (description && description.trim() && description !== 'Not provided') ? description.trim() : '';

    const creatorNotesSection = creatorNotes ? `
================================================================================
CREATOR'S SPECIFIC VIDEO NOTES (TOP PRIORITY DIRECTIVE - FOLLOW CLOSELY):
"${creatorNotes}"
================================================================================
CRITICAL CUSTOMIZATION RULES BASED ON THE CREATOR'S NOTES ABOVE:
1. The Primary Title and Alternative Titles MUST be directly crafted about the specific topic, challenge, events, or tools mentioned in the notes above.
2. In "📌 About This Video:", thoroughly narrate and break down the video specifically using the exact moments, items, and rules described in the creator's notes.
3. In "🎯 Keywords Related To Video", list 40-50 keywords tailored specifically to the video and challenge described in the creator's notes.
4. In "🔎 Keywords Related To Search Intent", generate 40-50 search queries that viewers search on YouTube specifically regarding this topic.
5. In "⚡ Keywords Related To ${channelNiche} Updates & Trends", generate 40-50 relevant keywords tying this content to the latest updates, events, and trends in ${channelNiche}.
` : `
NOTE: No specific creator notes were provided, so generate top-tier viral content for ${channelNiche} based on the file name or current trends.
`;

    const prompt = `You are a top ${channelNiche} creator and YouTube algorithm SEO strategist. Generate optimized content for ${platform}.
${audienceHistoryPrompt}
${youtubeResearchPrompt}
${creatorNotesSection}
${uploadDefaultTemplateInfo}
${toneAndVocabularyRules}
${shortsInstructions}
Video File / Title: ${title || 'Not provided'}
Creator Notes: ${creatorNotes || 'None provided'}
Tone: ${tone || 'engaging and energetic'}

Generate:
1. title: High CTR title ending with "🤔${channelSuffix}" custom-crafted specifically based on the Creator Notes (simple words, kid-friendly)
2. caption: Full description following ONLY the user's Upload Defaults template (MUST BE 4,500 TO 4,800 CHARACTERS, customized according to the Creator Notes, NO "[SECTION]" tags, simple words, zero AI buzzwords, ending with the hashtags)
3. hashtags: Array of 15-20 strings starting with ${JSON.stringify(mandatoryTagsArray)} and relevant tags matching the Creator Notes
4. alternativeTitles: Array of 3 catchy alternative titles ending with "🤔${channelSuffix}" based on the Creator Notes
5. bestTimeToPost: Best posting time recommendation explained simply

Format as valid JSON with keys: title, caption, hashtags, alternativeTitles, bestTimeToPost`;

    let response;
    const modelsToTry = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
    let lastError = null;
    for (const model of modelsToTry) {
      try {
        response = await genAI.models.generateContent({
          model,
          contents: prompt,
        });
        if (response?.text) break;
      } catch (mErr) {
        lastError = mErr;
        console.warn(`Model ${model} busy (${mErr.message}), waiting 1s & trying fallback...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!response?.text) throw lastError;

    const text = response.text;

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Ensure title ends with template suffix
      if (parsed.title && !parsed.title.includes(channelSuffix.trim())) {
        parsed.title = `${parsed.title.replace(/[\s\-\|]+$/, '')} 🤔${channelSuffix}`;
      }

      // Ensure alternative titles end with template suffix
      if (Array.isArray(parsed.alternativeTitles)) {
        parsed.alternativeTitles = parsed.alternativeTitles.map(t => {
          if (!t.includes(channelSuffix.trim())) {
            return `${t.replace(/[\s\-\|]+$/, '')} 🤔${channelSuffix}`;
          }
          return t;
        });
      }

      if (parsed.caption) {
        // Sync first line with actual generated title
        if (parsed.title) {
          const firstNl = parsed.caption.indexOf('\n');
          if (firstNl !== -1) {
            const rest = parsed.caption.substring(firstNl);
            parsed.caption = `${parsed.title}${rest}`;
          }
        }

        const primaryHashtag = mandatoryTagsArray[0] ? `#${mandatoryTagsArray[0]}` : '#youtube';
        if (!parsed.caption.includes(primaryHashtag)) {
          parsed.caption = `${parsed.caption.trim()}\n\n${mandatoryHashtagsText}`;
        }
        // If overall caption exceeds 4,850 characters (YouTube allows 5,000 max), truncate safely without losing footer hashtags
        if (parsed.caption.length > 4850) {
          const footerIdx = parsed.caption.lastIndexOf(primaryHashtag);
          if (footerIdx !== -1) {
            const footerPart = parsed.caption.substring(footerIdx);
            const bodyPart = parsed.caption.substring(0, footerIdx);
            const allowedBodyLen = 4850 - footerPart.length - 4;
            let trimmedBody = bodyPart.substring(0, allowedBodyLen);
            const lastBreak = Math.max(trimmedBody.lastIndexOf('\n'), trimmedBody.lastIndexOf('. '));
            if (lastBreak > allowedBodyLen * 0.7) {
              trimmedBody = trimmedBody.substring(0, lastBreak);
            }
            parsed.caption = `${trimmedBody.trim()}\n\n${footerPart.trim()}`;
          }
        }
      }

      // Ensure required hashtags exist in hashtag bubbles
      if (Array.isArray(parsed.hashtags)) {
        mandatoryTagsArray.forEach(tag => {
          const cleanTag = tag.replace(/^#/, '').trim();
          const tagWithHash = '#' + cleanTag;
          if (cleanTag && !parsed.hashtags.includes(cleanTag) && !parsed.hashtags.includes(tagWithHash)) {
            parsed.hashtags.unshift(cleanTag);
          }
        });
      }

      res.json(parsed);
    } else {
      res.json({ raw: text });
    }
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'AI generation failed: ' + err.message });
  }
});

const multer = require('multer');
const uploadMiddleware = multer({
  dest: path.join(__dirname, 'uploads/'),
  limits: { fileSize: 128 * 1024 * 1024 * 1024 }
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Ensure uploads folder exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

app.post('/api/upload', uploadMiddleware, async (req, res) => {
  const { title, caption, toYoutube, toInstagram, isShorts, privacy, categoryId, notifySubscribers, scheduledAt } = req.body;
  const file = req.files?.video?.[0];
  const thumbFile = req.files?.thumbnail?.[0];
  const shortsMode = isShorts === 'true';
  const isScheduled = !!scheduledAt && !isNaN(new Date(scheduledAt).getTime()) && (new Date(scheduledAt).getTime() > Date.now());

  if (!file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const results = {};
  const errors = [];

  try {
    // ── YOUTUBE UPLOAD ──
    if (toYoutube === 'true') {
      const stored = loadTokens();
      if (!stored.youtube) {
        errors.push('YouTube not connected');
      } else {
        try {
          const oauth2Client = getOAuthClient();
          oauth2Client.setCredentials(stored.youtube.tokens);

          // Auto-refresh token if needed
          oauth2Client.on('tokens', (newTokens) => {
            if (newTokens.refresh_token) {
              stored.youtube.tokens.refresh_token = newTokens.refresh_token;
            }
            stored.youtube.tokens.access_token = newTokens.access_token;
            stored.youtube.tokens.expiry_date = newTokens.expiry_date;
            saveTokens(stored);
          });

          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

          // Clean description — remove hashtags from description, keep them separate
          const descriptionParts = caption.split('\n\n');
          const cleanDescription = descriptionParts[0] || caption;
          const tags = (descriptionParts[1] || '').split(' ')
            .filter(t => t.startsWith('#'))
            .map(t => t.replace('#', '').trim())
            .filter(Boolean);

          // Add #Shorts to description for Shorts videos
          const finalDescription = shortsMode
            ? `${cleanDescription}\n\n#Shorts #YouTubeShorts`
            : cleanDescription;

          const videoStream = fs.createReadStream(file.path);

          const uploadRes = await youtube.videos.insert({
            part: ['snippet', 'status'],
            notifySubscribers: notifySubscribers !== 'false',
            requestBody: {
              snippet: {
                title: title.substring(0, 100),
                description: finalDescription,
                tags: shortsMode ? ['Shorts', 'YouTubeShorts', ...tags].slice(0, 30) : tags.slice(0, 30),
                categoryId: categoryId || '20',
                defaultLanguage: 'en'
              },
              status: isScheduled ? {
                privacyStatus: 'private',
                publishAt: new Date(scheduledAt).toISOString(),
                selfDeclaredMadeForKids: false
              } : {
                privacyStatus: privacy || 'public',
                selfDeclaredMadeForKids: false
              }
            },
            media: {
              mimeType: file.mimetype || 'video/mp4',
              body: videoStream
            }
          });

          const videoId = uploadRes.data.id;

          // Upload custom thumbnail if provided
          if (thumbFile && videoId) {
            try {
              const thumbStream = fs.createReadStream(thumbFile.path);
              await youtube.thumbnails.set({
                videoId,
                media: {
                  mimeType: thumbFile.mimetype || 'image/jpeg',
                  body: thumbStream
                }
              });
              try { fs.unlinkSync(thumbFile.path); } catch (e) {}
            } catch (thumbErr) {
              console.error('Thumbnail upload error:', thumbErr.message);
              // Non-fatal — video already uploaded
            }
          }
          if (isScheduled) {
            const posts = loadScheduledPosts();
            posts.unshift({
              id: videoId,
              title: uploadRes.data.snippet?.title || title,
              scheduledAt: new Date(scheduledAt).toISOString(),
              isShorts: shortsMode,
              createdAt: new Date().toISOString(),
              url: `https://www.youtube.com/watch?v=${videoId}`
            });
            saveScheduledPosts(posts);
          }

          results.youtube = {
            success: true,
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: uploadRes.data.snippet?.title,
            scheduled: isScheduled,
            scheduledAt: isScheduled ? new Date(scheduledAt).toISOString() : null
          };

          // Update token if refreshed
          const updatedCreds = oauth2Client.credentials;
          if (updatedCreds.access_token !== stored.youtube.tokens.access_token) {
            stored.youtube.tokens = { ...stored.youtube.tokens, ...updatedCreds };
            saveTokens(stored);
          }

        } catch (ytErr) {
          console.error('YouTube upload error:', ytErr.message);
          errors.push('YouTube upload failed: ' + ytErr.message);
          results.youtube = { success: false, error: ytErr.message };
        }
      }
    }

    // Cleanup temp file
    try { fs.unlinkSync(file.path); } catch (e) {}

    if (errors.length > 0 && !results.youtube?.success) {
      return res.status(500).json({ error: errors.join(', '), results });
    }

    res.json({ success: true, ...results });

  } catch (err) {
    // Cleanup on error
    try { if (file?.path) fs.unlinkSync(file.path); } catch (e) {}
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// ============================================================
// SCHEDULED POSTS API
// ============================================================
app.get('/api/scheduled', (req, res) => {
  const posts = loadScheduledPosts();
  const now = new Date();
  const enriched = posts.map(p => {
    const isPast = new Date(p.scheduledAt) <= now;
    return {
      ...p,
      status: isPast ? 'Published' : 'Scheduled'
    };
  });
  res.json({ posts: enriched });
});

app.delete('/api/scheduled/:id', (req, res) => {
  const { id } = req.params;
  const posts = loadScheduledPosts().filter(p => p.id !== id);
  saveScheduledPosts(posts);
  res.json({ success: true });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🤖 AI Content Agent is running!`);
  console.log(`📱 Open your browser: http://localhost:${PORT}\n`);
});
