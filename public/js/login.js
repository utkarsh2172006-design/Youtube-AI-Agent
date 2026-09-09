// ============================================================
// AI Content Agent — Login Page JavaScript
// ============================================================

// Create floating particles
function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDuration = (8 + Math.random() * 15) + 's';
    p.style.animationDelay = (Math.random() * 15) + 's';
    p.style.opacity = (0.1 + Math.random() * 0.4);
    p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
    container.appendChild(p);
  }
}

// Toggle setup guide
function toggleGuide(platform) {
  const guideId = `${platform}Guide`;
  const guide = document.getElementById(guideId);
  guide.classList.toggle('open');
}

// Check for errors in URL
function checkUrlErrors() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const errorMessages = {
    youtube_not_configured: '⚠️ YouTube API not configured. Add your Google Client ID and Secret to the .env file, then restart the server.',
    instagram_not_configured: '⚠️ Instagram API not configured. Add your Meta App ID and Secret to the .env file, then restart the server.',
    youtube_denied: 'YouTube connection was cancelled. Please try again.',
    instagram_denied: 'Instagram connection was cancelled. Please try again.',
    youtube_failed: '❌ YouTube authentication failed. Check your credentials in .env and try again.',
    instagram_failed: '❌ Instagram authentication failed. Make sure your account is a Business/Creator account connected to a Facebook Page.',
    no_facebook_page: '❌ No Facebook Page found. Connect your Instagram Business account to a Facebook Page first.',
    no_instagram_business: '❌ No Instagram Business account found. Make sure your Instagram is set to Business or Creator type.'
  };

  if (error && errorMessages[error]) {
    const banner = document.getElementById('errorBanner');
    document.getElementById('errorMessage').textContent = errorMessages[error];
    banner.style.display = 'flex';
  }
}

// Update UI based on connection status
function updateConnectionStatus(status) {
  // YouTube
  if (status.youtube && status.youtubeProfile) {
    const p = status.youtubeProfile;
    document.getElementById('ytStatus').innerHTML = `
      <div class="status-dot connected"></div>
      <span style="color:#4ade80">Connected as <strong>${p.channelName || p.name}</strong></span>
    `;
    const btn = document.getElementById('ytConnectBtn');
    btn.className = 'connect-btn connected-state';
    btn.innerHTML = `
      <span>✅ YouTube Connected</span>
      <span style="margin-left:auto;font-size:12px;opacity:0.7;cursor:pointer" onclick="disconnect('youtube')">Disconnect</span>
    `;
    document.getElementById('youtubeCard').style.borderColor = 'rgba(34,197,94,0.3)';
    document.getElementById('step1').classList.add('done');
  }

  // Instagram
  if (status.instagram && status.instagramProfile) {
    const p = status.instagramProfile;
    document.getElementById('igStatus').innerHTML = `
      <div class="status-dot connected"></div>
      <span style="color:#4ade80">Connected as <strong>@${p.username}</strong></span>
    `;
    const btn = document.getElementById('igConnectBtn');
    btn.className = 'connect-btn connected-state';
    btn.innerHTML = `
      <span>✅ Instagram Connected</span>
      <span style="margin-left:auto;font-size:12px;opacity:0.7;cursor:pointer" onclick="disconnect('instagram')">Disconnect</span>
    `;
    document.getElementById('instagramCard').style.borderColor = 'rgba(34,197,94,0.3)';
    document.getElementById('step1').classList.add('done');
  }

  // Gemini
  if (status.geminiConfigured) {
    document.getElementById('geminiStatus').innerHTML = `
      <div class="status-dot connected"></div>
      <span style="color:#4ade80">AI Ready</span>
    `;
    document.getElementById('geminiCard').style.borderColor = 'rgba(34,197,94,0.2)';
    document.getElementById('step2').classList.add('active', 'done');
  }

  // Enable dashboard button if at least one platform connected
  if (status.youtube || status.instagram) {
    const btn = document.getElementById('dashboardBtn');
    btn.disabled = false;
    document.getElementById('ctaHint').textContent = status.youtube && status.instagram
      ? '🎉 Both platforms connected! You\'re all set.'
      : '✅ One platform connected. You can add more later.';
    document.getElementById('step3').classList.add('active');
  }
}

// Connect YouTube
function connectYouTube() {
  window.location.href = '/auth/youtube';
}

// Connect Instagram
function connectInstagram() {
  window.location.href = '/auth/instagram';
}

// Disconnect platform
async function disconnect(platform) {
  if (!confirm(`Disconnect ${platform}? You'll need to reconnect later.`)) return;
  await fetch('/api/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform })
  });
  window.location.reload();
}

// Go to dashboard
function goToDashboard() {
  window.location.href = '/dashboard.html';
}

// Init
async function init() {
  createParticles();
  checkUrlErrors();

  try {
    const res = await fetch('/api/status');
    const status = await res.json();
    updateConnectionStatus(status);
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);
