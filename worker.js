export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // فایل‌های PWA
    if (path === '/manifest.json') {
      return new Response(JSON.stringify({
        name: "کلاس مجازی", short_name: "کلاس", start_url: "/login", display: "standalone",
        background_color: "#1e293b", theme_color: "#1e293b",
        icons: [{ src: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f396.png", sizes: "72x72", type: "image/png" }]
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (path === '/sw.js') {
      return new Response(`self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => e.waitUntil(clients.claim())); self.addEventListener('fetch', e => { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });`, { headers: { 'Content-Type': 'application/javascript' } });
    }

    // مسیر دانلود فایل‌ها از KV
    if (path.startsWith('/files/')) {
      const key = path.substring(7);
      const { value, metadata } = await env.FILES_KV.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!value) return new Response('File Not Found', { status: 404 });
      const headers = new Headers();
      headers.set('Content-Type', metadata.type || 'application/octet-stream');
      if (!metadata.type.startsWith('image/')) {
        headers.set('Content-Disposition', `attachment; filename="${metadata.name || 'file'}"`);
      }
      return new Response(value, { headers });
    }

    // مسیرهای API
    if (path.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    // فرانت‌اند
    if (path === '/' || path === '/login') {
      return new Response(getLoginHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' }});
    } else if (path === '/class') {
      return new Response(getClassHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' }});
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;

  // ثبت‌نام/ورود
  if (path === '/api/login' && request.method === 'POST') {
    const { username, classId, password } = await request.json();
    if (!username || !classId) return Response.json({ error: 'فیلدها الزامی است' }, { status: 400 });
    let role = 'student';
    const cls = await env.DB.prepare('SELECT * FROM classes WHERE classId = ?').bind(classId).first();
    if (cls) {
      if (cls.password === password) role = 'teacher';
    } else {
      if (!password) return Response.json({ error: 'شما اولین نفر هستید، باید برای کلاس رمز عبور تعیین کنید' }, { status: 400 });
      await env.DB.prepare('INSERT INTO classes (classId, password, teacher) VALUES (?, ?, ?)').bind(classId, password, username).run();
      role = 'teacher';
    }
    return Response.json({ success: true, username, classId, role });
  }

  // خروج کاربر
  if (path === '/api/logout' && request.method === 'POST') {
    const { username, classId } = await request.json();
    await env.DB.prepare('DELETE FROM online_users WHERE username = ? AND classId = ?').bind(username, classId).run();
    return Response.json({ success: true });
  }

  // پاک کردن کلاس
  if (path === '/api/clear-class' && request.method === 'POST') {
    const { classId, role } = await request.json();
    if (role !== 'teacher') return Response.json({ error: 'فقط معلم اجازه پاک کردن دارد' }, { status: 403 });
    await env.DB.prepare('DELETE FROM messages WHERE classId = ?').bind(classId).run();
    await env.DB.prepare('DELETE FROM whiteboard WHERE classId = ?').bind(classId).run();
    const list = await env.FILES_KV.list({ prefix: `class_${classId}_` });
    for (const key of list.keys) {
      await env.FILES_KV.delete(key.name);
    }
    return Response.json({ success: true });
  }

  // حذف پیام خاص
  if (path === '/api/delete-message' && request.method === 'POST') {
    const { id, role } = await request.json();
    if (role !== 'teacher') return Response.json({ error: 'فقط معلم مجاز است' }, { status: 403 });
    await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
    return Response.json({ success: true });
  }

  // آپلود فایل (غیر عکس) در KV
  if (path === '/api/upload-file' && request.method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file');
    const classId = formData.get('classId');
    if (!file || !classId) return Response.json({ error: 'فایل یافت نشد' }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '_');
    const key = `class_${classId}_${Date.now()}_${safeName}`;
    await env.FILES_KV.put(key, file.stream(), {
      metadata: { name: file.name, type: file.type }
    });
    return Response.json({ success: true, url: `/files/${key}`, type: file.type, name: file.name });
  }

  // لینک جلسه آنلاین
  if (path === '/api/set-meeting-link' && request.method === 'POST') {
    const { classId, link } = await request.json();
    await env.FILES_KV.put(`meeting_${classId}`, link);
    return Response.json({ success: true });
  }
  if (path === '/api/get-meeting-link' && request.method === 'GET') {
    const classId = url.searchParams.get('classId');
    const link = await env.FILES_KV.get(`meeting_${classId}`);
    return Response.json({ link: link || '' });
  }

  // ثبت حضور
  if (path === '/api/heartbeat' && request.method === 'POST') {
    const { username, classId, role } = await request.json();
    const now = Date.now();
    await env.DB.prepare('DELETE FROM online_users WHERE lastSeen < ?').bind(now - 5000).run();
    await env.DB.prepare('INSERT OR REPLACE INTO online_users (username, classId, lastSeen, role) VALUES (?, ?, ?, ?)').bind(username, classId, now, role).run();
    const users = await env.DB.prepare('SELECT username, role FROM online_users WHERE classId = ?').bind(classId).all();
    return Response.json({ onlineUsers: users.results });
  }

  // پیام‌ها
  if (path === '/api/get-messages' && request.method === 'GET') {
    const classId = url.searchParams.get('classId');
    const afterId = parseInt(url.searchParams.get('afterId') || '0');
    const msgs = await env.DB.prepare('SELECT * FROM messages WHERE classId = ? AND id > ? ORDER BY id ASC').bind(classId, afterId).all();
    return Response.json(msgs.results);
  }

  if (path === '/api/send-message' && request.method === 'POST') {
    const { classId, username, text, isMedia } = await request.json();
    const time = new Date().toLocaleTimeString('fa-IR');
    let safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (isMedia) {
      safeText = safeText.replace(/&lt;img /g, '<img ').replace(/&lt;div /g, '<div ').replace(/&lt;\/div&gt;/g, '</div>').replace(/&lt;span /g, '<span ').replace(/&lt;\/span&gt;/g, '</span>').replace(/&lt;a /g, '<a ').replace(/&lt;\/a&gt;/g, '</a>').replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>').replace(/&lt;br&gt;/g, '<br>');
    }
    await env.DB.prepare('INSERT INTO messages (classId, user, text, time) VALUES (?, ?, ?, ?)').bind(classId, username, safeText, time).run();
    return Response.json({ success: true });
  }

  // تخته سفید
  if (path === '/api/get-whiteboard' && request.method === 'GET') {
    const classId = url.searchParams.get('classId');
    const wb = await env.DB.prepare('SELECT data FROM whiteboard WHERE classId = ?').bind(classId).first();
    return Response.json({ data: wb ? wb.data : '' });
  }
  if (path === '/api/update-whiteboard' && request.method === 'POST') {
    const { classId, data } = await request.json();
    await env.DB.prepare('INSERT OR REPLACE INTO whiteboard (classId, data) VALUES (?, ?)').bind(classId, data).run();
    return Response.json({ success: true });
  }

  return new Response('API Not Found', { status: 404 });
}

// ---------------------------------------------
// صفحه ورود
// ---------------------------------------------
function getLoginHTML() {
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود به کلاس مجازی</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#1e293b">
  <style>
    body { font-family: Tahoma, sans-serif; background: #1e293b; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: white; }
    .box { background: #334155; padding: 30px; border-radius: 10px; width: 350px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { text-align: center; margin-top: 0; }
    input { width: 100%; padding: 10px; margin: 8px 0; border: none; border-radius: 5px; box-sizing: border-box; background: #475569; color: white;}
    input:read-only { background: #374151; color: #94a3b8; cursor: not-allowed; }
    button { width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-top: 10px; }
    .hint { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>🎓 ورود به کلاس</h2>
    <input type="text" id="username" placeholder="نام و نام‌خانوادگی">
    <input type="text" id="classId" placeholder="شناسه کلاس (مثلا: math-101)">
    <input type="password" id="password" placeholder="رمز عبور کلاس (فقط برای معلم)">
    <button onclick="login()">ورود به کلاس</button>
    <div class="hint">اگر با لینک دعوت وارد شده‌اید، فقط نام خود را بنویسید.</div>
  </div>
  <script>
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    window.onload = function() {
      const urlParams = new URLSearchParams(window.location.search);
      const classIdFromUrl = urlParams.get('classId');
      if (classIdFromUrl) {
        document.getElementById('classId').value = classIdFromUrl;
        document.getElementById('classId').readOnly = true;
        document.getElementById('password').style.display = 'none';
      }
    };
    function login() {
      const username = document.getElementById('username').value;
      const classId = document.getElementById('classId').value;
      const password = document.getElementById('password').value;
      if(!username || !classId) return alert('لطفاً نام و شناسه کلاس را وارد کنید');
      fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username, classId, password})
      }).then(r => r.json()).then(data => {
        if(data.error) return alert(data.error);
        localStorage.setItem('user', data.username);
        localStorage.setItem('classId', data.classId);
        localStorage.setItem('role', data.role);
        window.location.href = '/class';
      });
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------
// صفحه کلاس (ترکیبی: فشرده‌سازی عکس + آپلود فایل)
// ---------------------------------------------
function getClassHTML() {
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>کلاس مجازی</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#1e293b">
  <style>
    body { font-family: Tahoma, sans-serif; background: #f1f5f9; margin: 0; display: flex; flex-direction: column; height: 100vh; }
    .header { background: #1e293b; color: white; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; }
    .header-info { display: flex; gap: 15px; align-items: center; }
    .header .role { font-size: 12px; background: #3b82f6; padding: 3px 8px; border-radius: 10px; }
    .header-actions { display: flex; gap: 10px; align-items: center; }
    .btn-header { border: none; padding: 6px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px; }
    .btn-logout { background: #ef4444; color: white; }
    .btn-clear { background: #f59e0b; color: white; }
    .btn-meeting { background: #8b5cf6; color: white; text-decoration: none; display: none; }

    .invite-box { background: #0ea5e9; color: white; padding: 8px 20px; display: none; align-items: center; justify-content: center; gap: 10px; font-size: 13px; flex-wrap: wrap; }
    .invite-box input { flex: 1; min-width: 150px; padding: 4px; border: none; border-radius: 3px; font-family: monospace; text-align: center; direction: ltr; color: #333; }
    .invite-box button { background: #1e293b; color: white; border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; }

    .main-container { display: flex; flex: 1; overflow: hidden; }

    .sidebar { width: 250px; background: white; border-left: 1px solid #e2e8f0; padding: 15px; overflow-y: auto; }
    .sidebar h3 { margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
    .user-item { padding: 8px; background: #f8fafc; margin-bottom: 5px; border-radius: 5px; display: flex; align-items: center; }
    .user-item .dot { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; margin-left: 10px; }
    .user-item.teacher { border: 1px solid #3b82f6; background: #eff6ff; font-weight: bold; }

    .chat-container { flex: 1; display: flex; flex-direction: column; }
    .chat-box { flex: 1; padding: 20px; overflow-y: auto; background: #e2e8f0; display: flex; flex-direction: column; gap: 10px; }
    .message { background: white; padding: 10px 15px; border-radius: 10px; max-width: 70%; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.1); position: relative; }
    .message.self { align-self: flex-end; background: #dcf8c6; }

    .msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
    .msg-header .user { font-weight: bold; color: #1e293b; font-size: 12px; }
    .del-btn { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; padding: 0 5px; display: none; }
    .message .time { font-size: 10px; color: #94a3b8; text-align: left; margin-top: 5px; }

    .message a { color: #3b82f6; text-decoration: none; word-break: break-all; }
    .message img { max-width: 220px; border-radius: 8px; cursor: pointer; display: block; margin-top: 8px; }
    .file-box { display: flex; align-items: center; gap: 10px; background: #f8fafc; padding: 10px; border-radius: 8px; margin-top: 8px; border: 1px solid #e2e8f0;}
    .file-icon { font-size: 30px; }
    .file-info { display: flex; flex-direction: column; }
    .file-name { font-size: 13px; font-weight: bold; color: #1e293b; }
    .download-btn { display: inline-block; padding: 5px 10px; background: #1e293b; color: white; text-decoration: none; border-radius: 5px; font-size: 11px; cursor: pointer; margin-top: 3px; }

    .input-area { display: flex; padding: 15px; background: white; align-items: center; gap: 10px; }
    .input-area input[type="text"] { flex: 1; padding: 12px; border: 1px solid #cbd5e1; border-radius: 20px; outline: none; }
    .input-area button { background: #1e293b; color: white; border: none; padding: 0 20px; border-radius: 20px; cursor: pointer; height: 44px; }
    .upload-btn { background: #0ea5e9 !important; font-size: 20px; width: 44px; padding: 0 !important; display: flex; justify-content: center; align-items: center; position: relative; }
    .upload-spinner { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #0ea5e9; align-items: center; justify-content: center; font-size: 14px; color: white; border-radius: 20px; }

    .whiteboard-container { width: 400px; background: white; display: flex; flex-direction: column; }
    .whiteboard-header { padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; }
    canvas { flex: 1; cursor: crosshair; border: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-info">
      <div>کلاس: <span id="className"></span></div>
      <div>نقش: <span id="myRole" class="role"></span></div>
    </div>
    <div class="header-actions">
      <a id="meetingBtn" class="btn-header btn-meeting" href="#" target="_blank">🎙️ ورود به جلسه</a>
      <button id="clearBtn" class="btn-header btn-clear" style="display:none;" onclick="clearClass()">پاک کردن کلاس</button>
      <button class="btn-header btn-logout" onclick="logout()">خروج</button>
    </div>
  </div>

  <div class="invite-box" id="inviteBox">
    <span>لینک دعوت کلاس:</span>
    <input type="text" id="inviteLink" readonly>
    <button onclick="copyLink()">کپی</button>
    <span style="margin-right: 15px;">لینک جلسه:</span>
    <input type="text" id="meetingLinkInput" placeholder="https://skyroom.com/..." style="direction: ltr; max-width: 250px;">
    <button onclick="saveMeetingLink()">ذخیره</button>
  </div>

  <div class="main-container">
    <div class="sidebar">
      <h3>👥 افراد آنلاین</h3>
      <div id="onlineList"></div>
    </div>

    <div class="chat-container">
      <div class="chat-box" id="chatBox"></div>
      <div class="input-area">
        <input type="text" id="msgInput" placeholder="پیام خود را بنویسید..." onkeypress="if(event.key==='Enter') sendMessage()">
        <input type="file" id="fileInput" style="display:none" accept="image/*,.pdf,.doc,.docx,.zip,.rar" onchange="handleFileUpload()">
        <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
          📎
          <div id="uploadSpinner" class="upload-spinner">⏳</div>
        </button>
        <button onclick="sendMessage()">ارسال</button>
      </div>
    </div>

    <div class="whiteboard-container">
      <div class="whiteboard-header">تخته سفید (فقط معلم)</div>
      <canvas id="whiteboard" width="400" height="500"></canvas>
    </div>
  </div>

  <script>
    const username = localStorage.getItem('user');
    const classId = localStorage.getItem('classId');
    const role = localStorage.getItem('role');
    let lastMessageId = 0;

    if (!username || !classId) window.location.href = '/login';
    document.getElementById('className').innerText = classId;
    document.getElementById('myRole').innerText = role === 'teacher' ? 'معلم' : 'دانش‌آموز';

    if (role === 'teacher') {
      document.getElementById('inviteBox').style.display = 'flex';
      document.getElementById('clearBtn').style.display = 'inline-block';
      const baseUrl = window.location.origin + '/login';
      document.getElementById('inviteLink').value = baseUrl + '?classId=' + encodeURIComponent(classId);
      document.head.innerHTML += '<style>.del-btn { display: inline-block !important; }</style>';
    }

    async function checkMeetingLink() {
      const res = await fetch('/api/get-meeting-link?classId=' + classId);
      const data = await res.json();
      const btn = document.getElementById('meetingBtn');
      if (data.link) {
        btn.href = data.link;
        btn.style.display = 'inline-block';
        if (role === 'teacher') document.getElementById('meetingLinkInput').value = data.link;
      }
    }
    checkMeetingLink();

    async function saveMeetingLink() {
      const link = document.getElementById('meetingLinkInput').value.trim();
      if (!link) return alert('لطفا لینک جلسه را وارد کنید');
      await fetch('/api/set-meeting-link', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, link}) });
      alert('لینک جلسه ذخیره شد!');
      checkMeetingLink();
    }

    function copyLink() {
      const copyText = document.getElementById('inviteLink');
      copyText.select();
      document.execCommand('copy');
      alert('لینک کپی شد!');
    }

    async function logout() {
      await fetch('/api/logout', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, classId}) });
      localStorage.clear();
      window.location.href = '/login';
    }

    async function clearClass() {
      if(confirm('آیا مطمئن هستید؟ تمام چت‌ها، تخته سفید و فایل‌ها پاک شود؟')){
        await fetch('/api/clear-class', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, role}) });
        lastMessageId = 0;
        document.getElementById('chatBox').innerHTML = '';
        fetchWhiteboard();
      }
    }

    async function deleteMessage(id) {
      if(!confirm('آیا از حذف این پیام مطمئن هستید؟')) return;
      await fetch('/api/delete-message', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, role}) });
      document.getElementById('msg-' + id).remove();
    }

    // سیستم ترکیبی آپلود عکس و فایل
    async function handleFileUpload() {
      const fileInput = document.getElementById('fileInput');
      if (!fileInput.files || fileInput.files.length === 0) return;
      const file = fileInput.files[0];
      const spinner = document.getElementById('uploadSpinner');
      spinner.style.display = 'flex';

      try {
        // روش اول: اگر فایل عکس بود، فشرده کن و مستقیم بفرست (بدون ارور حجم)
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = async function(e) {
            const img = new Image();
            img.onload = async function() {
              const canvas = document.createElement('canvas');
              let width = img.width, height = img.height;
              const MAX_WIDTH = 800;
              if (width > MAX_WIDTH) { height = height * (MAX_WIDTH / width); width = MAX_WIDTH; }
              canvas.width = width; canvas.height = height;
              canvas.getContext('2d').drawImage(img, 0, 0, width, height);
              const base64String = canvas.toDataURL('image/jpeg', 0.7);
              const chatContent = '📸 <strong>یک عکس ارسال کرد</strong><br><img src="' + base64String + '" onclick="window.open(this.src)">';
              await fetch('/api/send-message', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, username, text: chatContent, isMedia: true}) });
              spinner.style.display = 'none';
              fileInput.value = '';
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        }
        // روش دوم: اگر فایل عکس نبود (PDF, Zip)، تو KV آپلود کن
        else {
          if (file.size > 5 * 1024 * 1024) {
            alert('حداکثر حجم مجاز فایل ۵ مگابایت است!');
            spinner.style.display = 'none';
            return;
          }
          const formData = new FormData();
          formData.append('file', file);
          formData.append('classId', classId);
          const res = await fetch('/api/upload-file', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.success) {
            let icon = '📄';
            if (data.type.includes('pdf')) icon = '📕';
            if (data.type.includes('zip') || data.type.includes('rar')) icon = '🗜️';
            const chatContent = '<div class="file-box"><div class="file-icon">'+icon+'</div><div class="file-info"><span class="file-name">'+data.name+'</span><a href="'+data.url+'" class="download-btn">⬇️ دانلود فایل</a></div></div>';
            await fetch('/api/send-message', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, username, text: chatContent, isMedia: true}) });
          } else { alert('خطا در آپلود'); }
          spinner.style.display = 'none';
          fileInput.value = '';
        }
      } catch(e) { alert('خطا در ارسال'); spinner.style.display = 'none'; fileInput.value = ''; }
    }

    async function fetchMessages() {
      const res = await fetch('/api/get-messages?classId=' + classId + '&afterId=' + lastMessageId);
      const data = await res.json();
      data.forEach(msg => { addMessageToUI(msg); lastMessageId = msg.id; });
    }

    function addMessageToUI(msg) {
      const chatBox = document.getElementById('chatBox');
      const div = document.createElement('div');
      div.className = 'message' + (msg.user === username ? ' self' : '');
      div.id = 'msg-' + msg.id;
      let processedText = msg.text;
      const urlRegex = /(https?:\\/\\/[^\\s]+)/g;
      processedText = processedText.replace(urlRegex, function(url) {
        if (url.match(/\\.(jpeg|jpg|gif|png|webp|svg)$/i)) return '📸 <a href="' + url + '" target="_blank">مشاهده عکس</a>';
        return '<a href="' + url + '" target="_blank">' + url + '</a>';
      });
      div.innerHTML = '<div class="msg-header"><span class="user">' + msg.user + '</span><button class="del-btn" onclick="deleteMessage(' + msg.id + ')">❌</button></div>' + processedText + '<div class="time">' + msg.time + '</div>';
      chatBox.appendChild(div);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
      const input = document.getElementById('msgInput');
      const text = input.value.trim();
      if (!text) return;
      await fetch('/api/send-message', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, username, text}) });
      input.value = '';
      fetchMessages();
    }

    async function heartbeat() {
      const res = await fetch('/api/heartbeat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, classId, role}) });
      const data = await res.json();
      renderOnlineUsers(data.onlineUsers);
    }
    function renderOnlineUsers(users) {
      const list = document.getElementById('onlineList');
      list.innerHTML = '';
      users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item' + (u.role === 'teacher' ? ' teacher' : '');
        div.innerHTML = '<div class="dot"></div> ' + u.username + (u.role === 'teacher' ? ' (معلم)' : '');
        list.appendChild(div);
      });
    }

    const canvas = document.getElementById('whiteboard');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e293b';
    if (role === 'teacher') {
      canvas.addEventListener('mousedown', (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
      canvas.addEventListener('mousemove', (e) => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
      canvas.addEventListener('mouseup', () => { drawing = false; saveWhiteboard(); });
      canvas.addEventListener('mouseleave', () => { drawing = false; saveWhiteboard(); });
    }
    function saveWhiteboard() {
      const data = canvas.toDataURL();
      fetch('/api/update-whiteboard', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, data}) });
    }
    async function fetchWhiteboard() {
      const res = await fetch('/api/get-whiteboard?classId=' + classId);
      const data = await res.json();
      if (data.data) {
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
        img.src = data.data;
      } else { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    setInterval(fetchMessages, 2000);
    setInterval(heartbeat, 2000);
    setInterval(fetchWhiteboard, 3000);
    fetchMessages(); heartbeat(); fetchWhiteboard();
  </script>
</body>
</html>`;
}