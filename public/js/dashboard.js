// ============================================================
// AI Content Agent — Dashboard JavaScript
// ============================================================

let currentFile = null;
let selectedTone = 'engaging and energetic';
let generatedData = null;
let videoType = 'long'; // 'long' or 'shorts'

// ── VIDEO TYPE SELECTION ──
function setVideoType(type) {
  videoType = type;

  const btnLong = document.getElementById('btnLongVideo');
  const btnShorts = document.getElementById('btnShorts');
  const dropZone = document.getElementById('dropZone');

  if (type === 'shorts') {
    btnShorts.classList.add('active', 'shorts-active');
    btnLong.classList.remove('active', 'shorts-active');
    dropZone.innerHTML = `
      <div class="drop-icon">⚡</div>
      <h3>Drop your Short here</h3>
      <p>Vertical 9:16 · Under 3 mins · No size limit</p>
      <div class="shorts-badge">⚡ Shorts Mode ON</div>
      <label class="upload-file-btn" style="margin-top:12px">
        <input type="file" id="videoFile" accept="video/*" onchange="handleFileSelect(event)" hidden />
        Browse Files
      </label>`;
  } else {
    btnLong.classList.add('active');
    btnLong.classList.remove('shorts-active');
    btnShorts.classList.remove('active', 'shorts-active');
    dropZone.innerHTML = `
      <div class="drop-icon">🎬</div>
      <h3>Drop your video here</h3>
      <p>MP4, MOV, AVI — No size limit</p>
      <label class="upload-file-btn">
        <input type="file" id="videoFile" accept="video/*" onchange="handleFileSelect(event)" hidden />
        Browse Files
      </label>`;
  }
}

let selectedPrivacy = 'public';
let thumbnailFile = null;

// ── THUMBNAIL HANDLER ──
function handleThumbnailSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  thumbnailFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('thumbnailPreview').src = e.target.result;
    document.getElementById('thumbnailPreviewWrap').style.display = 'block';
    document.getElementById('thumbnailBtnText').textContent = '✅ ' + file.name.substring(0, 18) + '...';
    document.getElementById('thumbnailLabel').classList.add('has-image');
  };
  reader.readAsDataURL(file);
}

// ── NAVIGATION ──
function showSection(section) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`section-${section}`).classList.add('active');
  document.getElementById(`nav-${section}`).classList.add('active');

  const titles = {
    upload: ['Upload & Post', 'Upload your content and let AI handle the rest'],
    research: ['Creator Research Radar', 'Real-time YouTube trends, viral competitor videos & audience demand'],
    schedule: ['Scheduler', 'Plan and schedule your posts in advance'],
    ai: ['AI Assistant', 'Chat with your AI content assistant'],
    history: ['Post History', 'Track your published content and performance']
  };
  document.getElementById('pageTitle').textContent = titles[section][0];
  document.getElementById('pageSubtitle').textContent = titles[section][1];

  if (section === 'schedule') {
    loadScheduledPosts();
  } else if (section === 'research') {
    loadResearchRadar();
  }
}

// ── STATUS LOAD ──
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const status = await res.json();

    // Status pills
    const pills = document.getElementById('statusPills');
    if (status.youtube && status.youtubeProfile) {
      pills.innerHTML += `
        <div class="status-pill">
          <div class="pill-dot"></div>
          <span>YouTube: ${status.youtubeProfile.channelName || status.youtubeProfile.name}</span>
        </div>`;
    }
    if (status.instagram && status.instagramProfile) {
      pills.innerHTML += `
        <div class="status-pill">
          <div class="pill-dot"></div>
          <span>Instagram: @${status.instagramProfile.username}</span>
        </div>`;
    }
    if (status.geminiConfigured) {
      pills.innerHTML += `<div class="status-pill"><div class="pill-dot"></div><span>AI Ready</span></div>`;
    }

    // Sidebar accounts
    const accountsList = document.getElementById('accountsList');
    let accountsHtml = '';
    if (status.youtube && status.youtubeProfile) {
      accountsHtml += `
        <div class="account-item">
          <div class="account-avatar" style="background:rgba(255,0,0,0.15)">▶️</div>
          <div class="account-info">
            <div class="account-name">${status.youtubeProfile.channelName || status.youtubeProfile.name}</div>
            <div class="account-platform">YouTube</div>
          </div>
        </div>`;
    }
    if (status.instagram && status.instagramProfile) {
      accountsHtml += `
        <div class="account-item">
          <div class="account-avatar" style="background:rgba(221,42,123,0.15)">📸</div>
          <div class="account-info">
            <div class="account-name">@${status.instagramProfile.username}</div>
            <div class="account-platform">Instagram</div>
          </div>
        </div>`;
    }
    accountsList.innerHTML = accountsHtml || '<div class="account-loading">No accounts connected</div>';

    // Enable/disable platform toggles
    if (!status.youtube) {
      document.getElementById('postToYoutube').disabled = true;
      document.getElementById('ytToggle').style.opacity = '0.3';
      document.getElementById('ytToggle').title = 'YouTube not connected';
    }
    if (!status.instagram) {
      document.getElementById('postToInstagram').disabled = true;
      document.getElementById('igToggle').style.opacity = '0.3';
      document.getElementById('igToggle').title = 'Instagram not connected';
    }

    // If neither connected, redirect
    if (!status.youtube && !status.instagram) {
      setTimeout(() => window.location.href = '/', 2000);
    }

    return status;
  } catch (err) {
    console.error('Status load error:', err);
  }
}

// ── PRIVACY SELECTION ──
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.privacy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.privacy-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPrivacy = btn.dataset.privacy;
    });
  });
});

// ── FILE HANDLING ──
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('drag-over');
}

function handleDragLeave(e) {
  document.getElementById('dropZone').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) setFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) setFile(file);
}

function setFile(file) {
  currentFile = file;
  document.getElementById('dropZone').style.display = 'none';
  const preview = document.getElementById('filePreview');
  preview.style.display = 'flex';
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatFileSize(file.size);
}

function removeFile() {
  currentFile = null;
  document.getElementById('dropZone').style.display = 'block';
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('videoFile').value = '';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── TONE SELECTION ──
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.dataset.tone;
    });
  });
});

// ── AI GENERATION ──
async function generateContent() {
  const notes = document.getElementById('contentNotes').value;
  const fileName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : '';
  const youtubeChecked = document.getElementById('postToYoutube').checked;
  const instagramChecked = document.getElementById('postToInstagram').checked;

  if (!youtubeChecked && !instagramChecked) {
    alert('Please select at least one platform (YouTube or Instagram)');
    return;
  }

  const platform = youtubeChecked && instagramChecked ? 'YouTube and Instagram'
    : youtubeChecked ? 'YouTube'
    : 'Instagram';

  const isShorts = videoType === 'shorts';
  const platformWithType = isShorts ? `YouTube Shorts (vertical short-form video, max 60 seconds)` : platform;

  // Show loading state
  const btn = document.getElementById('generateBtn');
  const btnText = document.getElementById('generateBtnText');
  const spinner = document.getElementById('generateSpinner');
  btn.disabled = true;
  btnText.style.display = 'none';
  spinner.style.display = 'block';

  document.getElementById('outputPlaceholder').style.display = 'flex';
  document.getElementById('outputContent').style.display = 'none';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fileName,
        description: notes,
        platform: platformWithType,
        tone: selectedTone,
        isShorts
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    generatedData = data;
    renderOutput(data);

  } catch (err) {
    alert('AI generation failed: ' + err.message + '\n\nMake sure your GEMINI_API_KEY is set in the .env file and restart the server.');
  } finally {
    btn.disabled = false;
    btnText.style.display = 'block';
    spinner.style.display = 'none';
  }
}

function renderOutput(data) {
  document.getElementById('outputPlaceholder').style.display = 'none';
  document.getElementById('outputContent').style.display = 'flex';

  document.getElementById('aiTitle').textContent = data.title || '';
  const captionEl = document.getElementById('aiCaption');
  captionEl.textContent = data.caption || '';
  updateCaptionCounter();
  captionEl.oninput = updateCaptionCounter;

  document.getElementById('aiBestTime').textContent = data.bestTimeToPost || 'Weekdays 6–9 PM (your local time)';

  // Hashtags
  const hashtagsEl = document.getElementById('aiHashtags');
  hashtagsEl.innerHTML = '';
  hashtagsEl.dataset.raw = (data.hashtags || []).join(' ');
  (data.hashtags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'hashtag';
    span.textContent = tag.startsWith('#') ? tag : '#' + tag;
    span.title = 'Click to remove';
    span.onclick = () => span.remove();
    hashtagsEl.appendChild(span);
  });

  // Store alternatives
  if (data.alternativeTitles) {
    const panel = document.getElementById('titleAlts');
    panel.innerHTML = '';
    data.alternativeTitles.forEach(alt => {
      const div = document.createElement('div');
      div.className = 'alt-option';
      div.textContent = alt;
      div.onclick = () => {
        document.getElementById('aiTitle').textContent = alt;
        panel.style.display = 'none';
      };
      panel.appendChild(div);
    });
  }
}

function updateCaptionCounter() {
  const text = document.getElementById('aiCaption')?.textContent || '';
  const count = text.length;
  const counter = document.getElementById('captionCharCount');
  if (counter) {
    counter.textContent = `${count.toLocaleString()} / 5,000 chars`;
    if (count >= 4400 && count <= 4850) {
      counter.style.color = '#4ade80'; // Optimal Green
      counter.title = 'Optimal SEO length (4,500 - 4,800 chars)';
    } else if (count > 4900) {
      counter.style.color = '#ef4444'; // Red Warning
      counter.title = 'Exceeding YouTube limit';
    } else {
      counter.style.color = '#c084fc'; // Purple
      counter.title = 'Growing description';
    }
  }
}

function showAlternatives(field) {
  const panel = document.getElementById(`${field}Alts`);
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

function copyField(fieldId) {
  const el = document.getElementById(fieldId);
  let text;
  if (fieldId === 'aiHashtags') {
    text = Array.from(el.querySelectorAll('.hashtag')).map(h => h.textContent).join(' ');
  } else {
    text = el.textContent;
  }
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const original = btn.textContent;
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = original, 1500);
  });
}

// ── POST NOW ──
async function postNow(scheduledDate = null) {
  if (!currentFile) {
    alert('Please upload a video file first.');
    return;
  }

  const youtubeChecked = document.getElementById('postToYoutube').checked;
  const instagramChecked = document.getElementById('postToInstagram').checked;
  let title = document.getElementById('aiTitle').textContent.trim() || currentFile.name.replace(/\.[^/.]+$/, '');
  const caption = document.getElementById('aiCaption').textContent.trim();
  const hashtags = Array.from(document.querySelectorAll('#aiHashtags .hashtag')).map(h => h.textContent).join(' ');

  const isShorts = videoType === 'shorts';

  // Auto-add #Shorts to title and description for Shorts
  if (isShorts) {
    if (!title.includes('#Shorts')) title = title + ' #Shorts';
  }

  const platforms = [youtubeChecked && 'YouTube', instagramChecked && 'Instagram'].filter(Boolean).join(' & ');
  const typeLabel = isShorts ? 'YouTube Short' : 'video';

  const isScheduling = !!scheduledDate;

  if (isScheduling) {
    const formattedRelease = new Date(scheduledDate).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    if (!confirm(`Schedule this ${typeLabel} "${title}" on YouTube for release on ${formattedRelease}?`)) {
      return;
    }
  } else {
    if (!confirm(`Ready to post this ${typeLabel} "${title}" to ${platforms}?`)) {
      return;
    }
  }

  // Button states
  const btn = document.getElementById('postNowBtn');
  const confirmBtn = document.getElementById('confirmScheduleBtn');
  const confirmText = document.getElementById('confirmScheduleText');
  const scheduleSpinner = document.getElementById('scheduleSpinner');

  if (isScheduling) {
    confirmBtn.disabled = true;
    confirmText.textContent = '⏳ Uploading & Scheduling...';
    scheduleSpinner.style.display = 'block';
  } else {
    btn.textContent = '⏳ Uploading...';
    btn.disabled = true;
  }

  const formData = new FormData();
  formData.append('video', currentFile);
  formData.append('title', title);
  formData.append('caption', caption + '\n\n' + hashtags);
  formData.append('toYoutube', youtubeChecked);
  formData.append('toInstagram', instagramChecked);
  formData.append('isShorts', isShorts);
  formData.append('privacy', selectedPrivacy);
  formData.append('categoryId', document.getElementById('videoCategory')?.value || '20');
  formData.append('notifySubscribers', document.getElementById('notifySubscribers')?.checked ?? true);
  if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
  if (isScheduling) formData.append('scheduledAt', new Date(scheduledDate).toISOString());

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await res.json();

    if (result.error) throw new Error(result.error);

    if (isScheduling) {
      const formattedRelease = new Date(scheduledDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      alert(`🎉 Video Scheduled Successfully on YouTube!\n\nRelease Time: ${formattedRelease}\nYouTube URL: ${result.youtube?.url || 'Ready'}\n\nYouTube will automatically publish it at your scheduled time.`);
      closeScheduleModal();
      loadScheduledPosts();
      showSection('schedule');
    } else {
      let successMsg = '🎉 Posted successfully!\n\n';
      if (result.youtube) successMsg += `✅ YouTube: ${result.youtube.url || 'Uploaded!'}\n`;
      if (result.instagram) successMsg += `✅ Instagram: ${result.instagram.url || 'Uploaded!'}`;
      alert(successMsg);
      btn.textContent = '✅ Posted!';
    }
  } catch (err) {
    alert((isScheduling ? 'Scheduling' : 'Upload') + ' failed: ' + err.message);
  } finally {
    if (isScheduling) {
      confirmBtn.disabled = false;
      confirmText.textContent = '🗓 Confirm & Schedule';
      scheduleSpinner.style.display = 'none';
    } else {
      btn.textContent = '🚀 Post Now';
      btn.disabled = false;
    }
  }
}

// ── SCHEDULING MODAL & QUEUE ──
function formatLocalDateTime(date) {
  const pad = n => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function openScheduleModal() {
  if (!currentFile) {
    alert('Please select or upload a video file first!');
    return;
  }
  const title = document.getElementById('aiTitle').textContent.trim() || currentFile.name.replace(/\.[^/.]+$/, '');
  document.getElementById('scheduleModalTitle').textContent = title;
  const isShorts = videoType === 'shorts';
  const badge = document.getElementById('scheduleModalTypeBadge');
  badge.textContent = isShorts ? '⚡ Shorts' : '🎬 Long Video';
  badge.className = 'preview-type-badge ' + (isShorts ? 'type-shorts' : 'type-long');

  // Timezone display
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById('userTimezoneHint').textContent = `🌐 Timezone: ${tz} (your local time)`;
  } catch (e) {}

  // Date input defaults
  const input = document.getElementById('scheduleDateTime');
  const now = new Date();
  input.min = formatLocalDateTime(new Date(now.getTime() + 5 * 60 * 1000)); // at least 5 mins ahead

  if (!input.value) {
    // Default to 2 hours from now
    const defaultTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    input.value = formatLocalDateTime(defaultTime);
  }

  document.getElementById('scheduleModal').style.display = 'flex';
}

function closeScheduleModal() {
  document.getElementById('scheduleModal').style.display = 'none';
}

function applySchedulePreset(preset) {
  const now = new Date();
  const input = document.getElementById('scheduleDateTime');

  if (typeof preset === 'number') {
    const target = new Date(now.getTime() + preset * 60 * 60 * 1000);
    input.value = formatLocalDateTime(target);
  } else if (preset === 'tomorrow_evening') {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(18, 0, 0, 0); // 6:00 PM
    input.value = formatLocalDateTime(target);
  }
}

function applyAiBestTime() {
  const input = document.getElementById('scheduleDateTime');
  const now = new Date();
  const target = new Date();

  // If before 5 PM today, pick today 6 PM; otherwise pick tomorrow 6 PM
  if (now.getHours() < 17) {
    target.setHours(18, 0, 0, 0);
  } else {
    target.setDate(target.getDate() + 1);
    target.setHours(18, 0, 0, 0);
  }
  input.value = formatLocalDateTime(target);
}

function submitSchedule() {
  const val = document.getElementById('scheduleDateTime').value;
  if (!val) {
    alert('Please select a date and time for the scheduled release.');
    return;
  }
  const schedDate = new Date(val);
  if (isNaN(schedDate.getTime()) || schedDate.getTime() <= Date.now() + 60 * 1000) {
    alert('Please pick a future time at least a few minutes from now.');
    return;
  }
  postNow(schedDate);
}

async function loadScheduledPosts() {
  const container = document.getElementById('scheduledList');
  const empty = document.getElementById('scheduledEmpty');
  if (!container) return;

  try {
    const res = await fetch('/api/scheduled');
    const data = await res.json();
    const posts = data.posts || [];

    if (posts.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }

    empty.style.display = 'none';
    container.innerHTML = posts.map(post => {
      const isShorts = post.isShorts;
      const schedDate = new Date(post.scheduledAt);
      const isPast = post.status === 'Published' || schedDate <= new Date();
      const timeStr = schedDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + schedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const countdown = getRelativeCountdown(schedDate);

      return `
        <div class="scheduled-card">
          <div class="scheduled-left">
            <div class="scheduled-icon">${isShorts ? '⚡' : '🎬'}</div>
            <div class="scheduled-info">
              <div class="scheduled-title" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</div>
              <div class="scheduled-meta">
                <span class="scheduled-badge-type ${isShorts ? 'type-shorts' : 'type-long'}">
                  ${isShorts ? '⚡ Shorts' : '🎬 Long Video'}
                </span>
                <span>📅 ${timeStr}</span>
                <span style="color: ${isPast ? '#4ade80' : '#c084fc'}">
                  ● ${isPast ? 'Published' : 'Scheduled on YouTube'}
                </span>
              </div>
            </div>
          </div>
          <div class="scheduled-right">
            <div class="scheduled-countdown">
              <div class="countdown-val">${countdown}</div>
              <div class="countdown-sub">${isPast ? 'Status' : 'until release'}</div>
            </div>
            ${post.url ? `<a href="${post.url}" target="_blank" class="scheduled-link-btn" title="View on YouTube">▶ Watch</a>` : ''}
            <button class="scheduled-del-btn" onclick="deleteScheduledPost('${post.id}')" title="Remove from list">🗑</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load scheduled posts:', err);
  }
}

function getRelativeCountdown(targetDate) {
  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) return 'Published';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `in ${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `in ${diffHours}h ${diffMins % 60}m`;
  return `in ${diffMins} mins`;
}

async function deleteScheduledPost(id) {
  if (!confirm('Remove this post from your scheduler list? (Note: To cancel or change visibility on YouTube directly, visit YouTube Studio)')) return;
  try {
    await fetch(`/api/scheduled/${id}`, { method: 'DELETE' });
    loadScheduledPosts();
  } catch (e) {
    alert('Failed to remove: ' + e.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}


// ── AI CHAT ──
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  addChatMessage(message, 'user');
  input.value = '';

  // Typing indicator
  const typingId = addChatMessage('...', 'ai', true);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: message,
        description: 'This is a conversational request from the user.',
        platform: 'general social media',
        tone: 'helpful and creative'
      })
    });
    const data = await res.json();
    removeTypingIndicator(typingId);

    const reply = data.caption || data.title || data.raw || 'I generated some content for you! Check the upload section.';
    addChatMessage(reply, 'ai');
  } catch (err) {
    removeTypingIndicator(typingId);
    addChatMessage('Sorry, I encountered an error. Make sure your Gemini API key is configured.', 'ai');
  }
}

function addChatMessage(text, sender, isTyping = false) {
  const messages = document.getElementById('chatMessages');
  const div = document.createElement('div');
  const id = 'msg-' + Date.now();
  div.id = id;
  div.className = `chat-msg ${sender === 'ai' ? 'ai-msg' : 'user-msg'}`;
  div.innerHTML = `<div class="chat-bubble">${text}</div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:rgba(34,197,94,0.9);color:white;padding:14px 20px;border-radius:12px;font-weight:600;font-size:14px;animation:fadeIn 0.3s ease;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── CHANNEL SETTINGS & DEFAULTS ──
let activeChannelId = null;

async function openChannelSettingsModal() {
  const modal = document.getElementById('channelSettingsModal');
  if (!modal) return;
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/channel/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      activeChannelId = s.channelId || 'default';
      document.getElementById('settingChannelName').value = s.channelName || '';
      document.getElementById('settingNiche').value = s.niche || '';
      document.getElementById('settingInstagram').value = s.instagram || '';
      document.getElementById('settingWhatsapp').value = s.whatsapp || '';
      document.getElementById('settingBusinessEmail').value = s.businessEmail || '';
      document.getElementById('settingHashtags').value = Array.isArray(s.defaultHashtags)
        ? s.defaultHashtags.join(', ')
        : (s.defaultHashtags || '');
    }
  } catch (err) {
    console.warn('Could not load channel settings:', err.message);
  }
}

function closeChannelSettingsModal() {
  const modal = document.getElementById('channelSettingsModal');
  if (modal) modal.style.display = 'none';
}

async function saveChannelSettingsFromModal() {
  const btn = document.getElementById('saveSettingsBtn');
  const spinner = document.getElementById('saveSettingsSpinner');
  const text = document.getElementById('saveSettingsText');

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  text.textContent = 'Saving...';

  const payload = {
    channelId: activeChannelId || 'default',
    channelName: document.getElementById('settingChannelName').value.trim(),
    niche: document.getElementById('settingNiche').value.trim(),
    instagram: document.getElementById('settingInstagram').value.trim(),
    whatsapp: document.getElementById('settingWhatsapp').value.trim(),
    businessEmail: document.getElementById('settingBusinessEmail').value.trim(),
    defaultHashtags: document.getElementById('settingHashtags').value.split(',').map(t => t.trim()).filter(Boolean)
  };

  try {
    const res = await fetch('/api/channel/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeChannelSettingsModal();
      showToast('✅ Channel defaults saved successfully!');
    } else {
      alert('Error saving defaults: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to save channel defaults: ' + err.message);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
    text.textContent = '💾 Save Defaults';
  }
}

// ============================================================
// ── CREATOR RESEARCH RADAR (100% YOUTUBE END-TO-END) ──
// ============================================================
let radarTimeframe = '7d';
let radarFormat = 'all';
let radarPillar = 'all';
let radarQuery = '';
let radarViewMode = 'all';
let currentRadarVideos = [];

function setRadarViewMode(mode) {
  radarViewMode = mode;
  document.querySelectorAll('.radar-mode-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });

  const secVelocity = document.getElementById('radarSectionVelocity');
  const secAudience = document.getElementById('radarSectionAudience');
  const secTrending = document.getElementById('radarSectionTrending');

  if (secVelocity) secVelocity.style.display = (mode === 'all' || mode === 'velocity') ? 'flex' : 'none';
  if (secAudience) secAudience.style.display = (mode === 'all' || mode === 'relevancy') ? 'flex' : 'none';
  if (secTrending) secTrending.style.display = (mode === 'all' || mode === 'trending') ? 'flex' : 'none';
}

function setRadarPillar(pId) {
  radarPillar = pId;
  document.querySelectorAll('#audiencePillarsChips .filter-chip').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-pillar') === pId);
  });
  loadResearchRadar();
}

function setRadarTimeframe(tf) {
  radarTimeframe = tf;
  document.querySelectorAll('#timeframeChips .filter-chip').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-timeframe') === tf);
  });
  loadResearchRadar();
}

function setRadarFormat(fmt) {
  radarFormat = fmt;
  document.querySelectorAll('#formatChips .filter-chip').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-format') === fmt);
  });
  loadResearchRadar();
}

function handleRadarSearchKey(e) {
  if (e.key === 'Enter') {
    executeRadarSearch();
  }
}

function executeRadarSearch() {
  const input = document.getElementById('radarSearchInput');
  radarQuery = input ? input.value.trim() : '';
  loadResearchRadar();
}

function refreshResearchRadar() {
  loadResearchRadar(true);
}

async function loadResearchRadar(forceRefresh = false) {
  const container = document.getElementById('radarSectionsContainer');
  const gridVelocity = document.getElementById('radarVelocityGrid');
  const gridAudience = document.getElementById('radarGrid');
  const gridTrending = document.getElementById('radarTrendingGrid');
  const loading = document.getElementById('radarLoading');
  const empty = document.getElementById('radarEmpty');
  const summaryCount = document.getElementById('radarResultCount');
  const cacheIndicator = document.getElementById('radarCacheTime');
  const nichePill = document.getElementById('radarNichePill');
  const pillarsChips = document.getElementById('audiencePillarsChips');
  const velocitySummaryPill = document.getElementById('velocitySummaryPill');
  const audienceSummaryPill = document.getElementById('audienceSummaryPill');

  if (!gridAudience) return;

  if (container) container.style.display = 'none';
  empty.style.display = 'none';
  loading.style.display = 'flex';

  try {
    const params = new URLSearchParams({
      timeframe: radarTimeframe,
      format: radarFormat,
      pillar: radarPillar,
      query: radarQuery,
      refresh: forceRefresh ? 'true' : 'false'
    });

    const res = await fetch(`/api/research/radar?${params.toString()}`);
    const data = await res.json();

    loading.style.display = 'none';

    if (!data.success || !data.videos || !data.videos.length) {
      empty.style.display = 'flex';
      if (summaryCount) summaryCount.textContent = '0 videos found';
      return;
    }

    currentRadarVideos = data.videos;
    if (nichePill && data.niche) {
      nichePill.textContent = `🎮 Niche: ${data.niche.toUpperCase()} · 🔥 80K+ Views`;
    }

    // Render dynamic audience pillars from channel history
    if (pillarsChips && data.pillars && data.pillars.length) {
      pillarsChips.innerHTML = data.pillars.map(p => `
        <button class="filter-chip ${p.id === radarPillar ? 'active' : ''}" data-pillar="${p.id}" onclick="setRadarPillar('${p.id}')">
          ${p.label}
        </button>
      `).join('');
    }

    // 1. Render Velocity Outliers (Abnormal view spikes in record time - Unrestricted)
    const velocityList = data.velocityOutliers && data.velocityOutliers.length ? data.velocityOutliers : (data.videos || []);
    if (gridVelocity) {
      gridVelocity.innerHTML = velocityList.map(v => renderVelocityCard(v)).join('');
    }
    if (velocitySummaryPill) {
      velocitySummaryPill.textContent = `🔥 ${velocityList.length} High-Surge Outliers`;
    }
    const modeCountVelocity = document.getElementById('modeCountVelocity');
    if (modeCountVelocity) {
      modeCountVelocity.textContent = `${velocityList.length} Outliers`;
    }

    // 2. Render Channel Audience Matched (Unrestricted)
    const audienceList = data.audienceVideos && data.audienceVideos.length ? data.audienceVideos : (data.videos || []);
    if (gridAudience) {
      gridAudience.innerHTML = audienceList.map(v => renderRadarCard(v)).join('');
    }
    if (audienceSummaryPill) {
      audienceSummaryPill.textContent = `${audienceList.length} Grounded Hits`;
    }
    const modeCountAudience = document.getElementById('modeCountAudience');
    if (modeCountAudience) {
      modeCountAudience.textContent = `${audienceList.length} Grounded`;
    }

    // 3. Render Beyond Relevancy (YouTube Trending Gaming Chart - Unrestricted)
    const trendingList = data.trendingBeyond || [];
    if (gridTrending && trendingList.length) {
      gridTrending.innerHTML = trendingList.map((v, idx) => renderTrendingCard(v, idx + 1)).join('');
    }
    const modeCountTrending = document.getElementById('modeCountTrending');
    if (modeCountTrending) {
      modeCountTrending.textContent = `${trendingList.length} Trending`;
    }

    if (summaryCount) {
      summaryCount.textContent = `Showing ${velocityList.length} Velocity Outliers · ${audienceList.length} Audience Matches · ${trendingList.length} Trending Hits (🔥 80K+ Views Only)`;
    }
    if (cacheIndicator) {
      cacheIndicator.textContent = forceRefresh ? '⚡ Freshly Scanned' : '⚡ 100% YouTube Platform Grounded';
    }

    if (container) container.style.display = 'flex';
    setRadarViewMode(radarViewMode);

  } catch (err) {
    loading.style.display = 'none';
    empty.style.display = 'flex';
    console.error('Failed to load Research Radar:', err);
    showToast('⚠️ Could not load YouTube trends: ' + err.message);
  }
}

function formatRadarUploadDate(dateString, hoursAgo) {
  if (!dateString) {
    if (hoursAgo !== undefined && hoursAgo !== null && !isNaN(hoursAgo)) {
      if (hoursAgo < 24) return { full: `${hoursAgo}h ago`, date: `${hoursAgo} hours ago`, rel: `${hoursAgo}h ago` };
      const days = Math.max(1, Math.round(hoursAgo / 24));
      return { full: `${days}d ago`, date: `${days} days ago`, rel: `${days}d ago` };
    }
    return { full: 'Recently', date: 'Recently', rel: 'Recent' };
  }

  const d = new Date(dateString);
  if (isNaN(d.getTime())) {
    return { full: 'Recently', date: 'Recently', rel: 'Recent' };
  }

  const dateFormatted = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  let rel = '';
  if (hoursAgo !== undefined && hoursAgo !== null && !isNaN(hoursAgo)) {
    if (hoursAgo < 1) rel = 'Just now';
    else if (hoursAgo < 24) rel = `${hoursAgo}h ago`;
    else {
      const days = Math.max(1, Math.round(hoursAgo / 24));
      rel = `${days}d ago`;
    }
  } else {
    const diffHours = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60));
    if (diffHours < 24) rel = `${Math.max(1, diffHours)}h ago`;
    else rel = `${Math.max(1, Math.round(diffHours / 24))}d ago`;
  }

  return {
    date: dateFormatted,
    rel: rel,
    full: `${dateFormatted} (${rel})`
  };
}

function renderVelocityCard(v) {
  const uploadInfo = formatRadarUploadDate(v.publishedAt, v.hoursAgo);
  const abnormalMultiplierText = v.outlierScore >= 2
    ? `🚀 Abnormal View Surge: <b>${v.outlierScore}x</b> normal size`
    : `⚡ High Velocity: <b>${formatCompactNum(v.viewVelocity)} views/hr</b>`;

  const velocityBadge = v.viewVelocity > 0
    ? `<div class="velocity-tag">⚡ ${formatCompactNum(v.viewVelocity)}/hr</div>`
    : '';

  const outlierBadge = `<div class="outlier-tag">🔥 ${v.outlierScore}x Outlier</div>`;
  const durationBadge = v.duration ? `<div class="duration-tag">${v.duration}</div>` : '';

  const questionsHtml = v.topViewerQuestions && v.topViewerQuestions.length
    ? `<div class="card-question-box">
        <div class="card-question-lbl">💬 Real Viewer Question:</div>
        "${escapeHtml(v.topViewerQuestions[0])}"
       </div>`
    : '';

  const tagsHtml = v.tags && v.tags.length
    ? `<div class="card-tags-row">
        ${v.tags.slice(0, 4).map(t => `<span class="card-tag-pill">#${escapeHtml(t)}</span>`).join('')}
       </div>`
    : '';

  const videoJsonEscaped = escapeHtml(JSON.stringify({
    id: v.id,
    title: v.title,
    videoUrl: v.videoUrl,
    channelTitle: v.channelTitle,
    tags: v.tags || [],
    isShort: v.isShort,
    topViewerQuestions: v.topViewerQuestions || []
  }));

  return `
    <div class="radar-card" style="border-color: rgba(239, 68, 68, 0.3); box-shadow: 0 4px 20px rgba(239, 68, 68, 0.08);">
      <div class="card-media">
        <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer">
          <img src="${v.thumbnail}" class="card-thumb-img" alt="${escapeHtml(v.title)}" loading="lazy" />
        </a>
        <div class="card-overlay-badges">
          ${outlierBadge}
          ${velocityBadge}
        </div>
        ${durationBadge}
      </div>

      <div class="card-body">
        <div class="abnormal-spike-box">
          ${abnormalMultiplierText}
        </div>

        <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="card-video-title" title="${escapeHtml(v.title)}">
          ${escapeHtml(v.title)}
        </a>

        <div class="card-channel-row">
          <span class="card-channel-name" title="${escapeHtml(v.channelTitle)}">👤 ${escapeHtml(v.channelTitle)}</span>
          <span style="color:#cbd5e1; font-weight:600;">${v.channelSubscribers ? formatCompactNum(v.channelSubscribers) + ' subs' : 'Breakout Channel'}</span>
        </div>

        <div class="card-upload-row">
          <span class="card-upload-date">📅 <b>Uploaded:</b> ${uploadInfo.date}</span>
          <span class="card-upload-recency" style="color:#f87171; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.25);">⚡ ${uploadInfo.rel}</span>
        </div>

        <div class="card-metrics-grid">
          <div>
            <div class="metric-item-num" style="color:#f87171;">${formatCompactNum(v.viewCount)}</div>
            <div class="metric-item-lbl">Views</div>
          </div>
          <div>
            <div class="metric-item-num">${formatCompactNum(v.likeCount)}</div>
            <div class="metric-item-lbl">Likes</div>
          </div>
          <div>
            <div class="metric-item-num">${v.engagementRate}%</div>
            <div class="metric-item-lbl">Engage</div>
          </div>
        </div>

        ${questionsHtml}
        ${tagsHtml}

        <div class="card-actions">
          <button class="card-btn-remix" onclick='remixRadarVideo(${videoJsonEscaped})'>
            <span>⚡ Remix This Outlier</span>
          </button>
          <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="card-btn-youtube" title="Watch on YouTube">
            ▶ Watch
          </a>
          <button class="card-btn-copy" onclick="copyRadarLink('${v.videoUrl}')" title="Copy YouTube Link">
            📋
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTrendingCard(v, rank) {
  const uploadInfo = formatRadarUploadDate(v.publishedAt, v.hoursAgo);
  const durationBadge = v.duration ? `<div class="duration-tag">${v.duration}</div>` : '';

  const videoJsonEscaped = escapeHtml(JSON.stringify({
    id: v.id,
    title: v.title,
    videoUrl: v.videoUrl,
    channelTitle: v.channelTitle,
    adaptationHook: v.adaptationHook || ''
  }));

  return `
    <div class="radar-card" style="border-color: rgba(56, 189, 248, 0.3); box-shadow: 0 4px 20px rgba(56, 189, 248, 0.08);">
      <div class="card-media">
        <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer">
          <img src="${v.thumbnail}" class="card-thumb-img" alt="${escapeHtml(v.title)}" loading="lazy" />
        </a>
        <div class="card-overlay-badges">
          <div class="outlier-tag" style="background:linear-gradient(135deg,#0284c7,#0ea5e9); box-shadow:0 2px 10px rgba(14,165,233,0.4);">🔥 #${rank} Trending</div>
          <div class="velocity-tag">🌐 Macro Hit</div>
        </div>
        ${durationBadge}
      </div>

      <div class="card-body">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:11px; font-weight:700; color:#38bdf8;">🌐 Outside Your Direct Niche</span>
          <span style="font-size:11px; color:#94a3b8;">${formatCompactNum(v.viewCount)} views</span>
        </div>

        <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="card-video-title" title="${escapeHtml(v.title)}">
          ${escapeHtml(v.title)}
        </a>

        <div class="card-channel-row">
          <span class="card-channel-name">👤 ${escapeHtml(v.channelTitle)}</span>
          <span style="color:#38bdf8; font-weight:600;">YouTube Gaming</span>
        </div>

        <div class="card-upload-row">
          <span class="card-upload-date">📅 <b>Uploaded:</b> ${uploadInfo.date}</span>
          <span class="card-upload-recency" style="color:#38bdf8; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.25);">🔥 ${uploadInfo.rel}</span>
        </div>

        <div class="card-steal-hook-box">
          <b>💡 Format to Steal:</b><br/>
          ${escapeHtml(v.adaptationHook)}
        </div>

        <div class="card-actions">
          <button class="card-btn-remix" style="background:linear-gradient(135deg,#0284c7,#8b5cf6);" onclick='remixTrendingVideo(${videoJsonEscaped})'>
            <span>⚡ Adapt into Free Fire Video</span>
          </button>
          <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="card-btn-youtube" title="Watch on YouTube">
            ▶ Watch
          </a>
          <button class="card-btn-copy" onclick="copyRadarLink('${v.videoUrl}')" title="Copy YouTube Link">
            📋
          </button>
        </div>
      </div>
    </div>
  `;
}

function remixTrendingVideo(videoData) {
  showToast('⚡ Adapting trending concept into your channel format...');
  const promptNotes = `Inspired by trending YouTube video: "${videoData.title}" by ${videoData.channelTitle}.\nAdaptation Concept for Free Fire: ${videoData.adaptationHook}\nChallenge format with intense gameplay and high-stakes Booyah ending.`;
  showSection('upload');
  const notesField = document.getElementById('contentNotes');
  if (notesField) {
    notesField.value = promptNotes;
  }
  showToast('✨ Trending concept adapted & transferred to Upload tab!');
  const genBtn = document.getElementById('generateBtn');
  if (genBtn) {
    genBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    genBtn.style.animation = 'pulseDot 1.5s 2';
  }
}

function renderRadarCard(v) {
  const uploadInfo = formatRadarUploadDate(v.publishedAt, v.hoursAgo);
  const outlierBadge = v.outlierScore >= 2
    ? `<div class="outlier-tag">🔥 ${v.outlierScore}x Outlier</div>`
    : (v.outlierScore >= 1.2
        ? `<div class="outlier-tag" style="background:linear-gradient(135deg,#f59e0b,#d97706); box-shadow:0 2px 10px rgba(245,158,11,0.4);">🚀 Breakout (${v.outlierScore}x)</div>`
        : (v.viewVelocity > 500 ? `<div class="outlier-tag" style="background:linear-gradient(135deg,#8b5cf6,#ec4899); box-shadow:0 2px 10px rgba(139,92,246,0.4);">⚡ High Velocity</div>` : ''));

  const velocityText = v.viewVelocity > 0
    ? `<div class="velocity-tag">⚡ ${formatCompactNum(v.viewVelocity)}/hr</div>`
    : '';

  const affinityBadge = v.audienceAffinity
    ? `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.3); color:#4ade80; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700;">🎯 ${v.audienceAffinity}% Audience Match</div>`
    : '';

  const pillarText = v.matchedPillar
    ? `<span style="color:#a855f7; font-size:11px; font-weight:700; background:rgba(168,85,247,0.1); border:1px solid rgba(168,85,247,0.25); padding:2px 7px; border-radius:6px;">${escapeHtml(v.matchedPillar)}</span>`
    : '';

  const matchReasonHtml = v.matchReason
    ? `<div style="font-size:11px; color:#38bdf8; display:flex; align-items:center; gap:5px; margin-top:2px;">
        <span>💡</span> <span>${escapeHtml(v.matchReason)}</span>
       </div>`
    : '';

  const durationBadge = v.duration ? `<div class="duration-tag">${v.duration}</div>` : '';

  const questionsHtml = v.topViewerQuestions && v.topViewerQuestions.length
    ? `<div class="card-question-box">
        <div class="card-question-lbl">💬 Real Viewer Question:</div>
        "${escapeHtml(v.topViewerQuestions[0])}"
       </div>`
    : '';

  const tagsHtml = v.tags && v.tags.length
    ? `<div class="card-tags-row">
        ${v.tags.slice(0, 5).map(t => `<span class="card-tag-pill">#${escapeHtml(t)}</span>`).join('')}
       </div>`
    : '';

  const videoJsonEscaped = escapeHtml(JSON.stringify({
    id: v.id,
    title: v.title,
    videoUrl: v.videoUrl,
    channelTitle: v.channelTitle,
    tags: v.tags || [],
    isShort: v.isShort,
    topViewerQuestions: v.topViewerQuestions || []
  }));

  return `
    <div class="radar-card">
      <div class="card-media">
        <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer">
          <img src="${v.thumbnail}" class="card-thumb-img" alt="${escapeHtml(v.title)}" loading="lazy" />
        </a>
        <div class="card-overlay-badges">
          ${outlierBadge || '<div></div>'}
          ${velocityText}
        </div>
        ${durationBadge}
      </div>

      <div class="card-body">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
            ${affinityBadge}
            ${pillarText}
          </div>
          ${matchReasonHtml}
        </div>

        <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="card-video-title" title="${escapeHtml(v.title)}">
          ${escapeHtml(v.title)}
        </a>

        <div class="card-channel-row">
          <span class="card-channel-name" title="${escapeHtml(v.channelTitle)}">👤 ${escapeHtml(v.channelTitle)}</span>
          <span>${v.channelSubscribers ? formatCompactNum(v.channelSubscribers) + ' subs' : 'YouTube'}</span>
        </div>

        <div class="card-upload-row">
          <span class="card-upload-date">📅 <b>Uploaded:</b> ${uploadInfo.date}</span>
          <span class="card-upload-recency" style="color:#4ade80; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.25);">🕒 ${uploadInfo.rel}</span>
        </div>

        <div class="card-metrics-grid">
          <div>
            <div class="metric-item-num">${formatCompactNum(v.viewCount)}</div>
            <div class="metric-item-lbl">Views</div>
          </div>
          <div>
            <div class="metric-item-num">${formatCompactNum(v.likeCount)}</div>
            <div class="metric-item-lbl">Likes</div>
          </div>
          <div>
            <div class="metric-item-num">${v.engagementRate}%</div>
            <div class="metric-item-lbl">Engage</div>
          </div>
        </div>

        ${questionsHtml}
        ${tagsHtml}

        <div class="card-actions">
          <button class="card-btn-remix" onclick='remixRadarVideo(${videoJsonEscaped})'>
            <span>⚡ Remix & Make Video</span>
          </button>
          <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="card-btn-youtube" title="Watch on YouTube">
            ▶ Watch
          </a>
          <button class="card-btn-copy" onclick="copyRadarLink('${v.videoUrl}')" title="Copy YouTube Link">
            📋
          </button>
        </div>
      </div>
    </div>
  `;
}

function formatCompactNum(num) {
  if (!num || isNaN(num)) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function copyRadarLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 YouTube link copied to clipboard!');
  }).catch(() => {
    prompt('Copy YouTube Link:', url);
  });
}

async function remixRadarVideo(videoData) {
  showToast('⚡ Formulating custom angles for your channel...');

  let suggestedNotes = `Inspired by trending YouTube video: "${videoData.title}". Challenge / Gameplay highlights using top weapons, clutching high lobby matches.`;
  
  if (videoData.topViewerQuestions && videoData.topViewerQuestions.length) {
    suggestedNotes += `\nAnswering real viewer question: "${videoData.topViewerQuestions[0]}"`;
  }
  if (videoData.tags && videoData.tags.length) {
    suggestedNotes += `\nTarget keywords: ${videoData.tags.slice(0, 8).join(', ')}`;
  }

  // Switch to Upload & Post tab
  showSection('upload');

  // Set format (Shorts vs Long)
  setVideoType(videoData.isShort ? 'shorts' : 'long');

  // Pre-fill notes
  const notesField = document.getElementById('contentNotes');
  if (notesField) {
    notesField.value = suggestedNotes;
  }

  showToast('✨ Topic remixed & transferred to Upload tab! Click "Generate with AI".');

  // Smooth scroll to generate button
  const genBtn = document.getElementById('generateBtn');
  if (genBtn) {
    genBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    genBtn.style.animation = 'pulseDot 1.5s 2';
  }
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  loadStatus();

  // Check if just connected from login page
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('connected');
  if (connected) {
    showToast(`✅ ${connected.charAt(0).toUpperCase() + connected.slice(1)} connected successfully!`);
  }
});

