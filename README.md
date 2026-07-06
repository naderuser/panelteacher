# 🏫 پنل معلم - کلاس مجازی

سامانه کلاس مجازی برای معلمان و دانش‌آموزان، ساخته شده با Cloudflare Workers.

## ✨ قابلیت‌ها

### 📚 مدیریت کلاس
- ایجاد کلاس مجازی با کد اختصاصی
- ورود معلم و دانش‌آموز با رمز عبور
- نمایش لیست کلاس‌های فعال

### 💬 چت real-time
- ارسال پیام در کلاس
- به‌روزرسانی خودکار هر ۲ ثانیه
- نمایش پیام‌های قدیمی

### 🎨 تخته سفید
- رسم آنلاین برای معلم
- ذخیره خودکار در KV
- همگام‌سازی بین کاربران

### 📁 مدیریت فایل
- آپلود فایل برای کلاس
- دانلود فایل‌های کلاس
- ذخیره در Cloudflare KV

### 📹 لینک جلسه
- تنظیم لینک جلسه (Zoom, Google Meet, etc.)
- دسترسی سریع برای دانش‌آموزان

### 📱 PWA
- نصب به عنوان اپلیکیشن
- کار آفلاین با cache

## 🔌 API Endpoints

| متد | مسیر | توضیح |
|------|------|-------|
| POST | `/api/login` | ورود به کلاس |
| POST | `/api/logout` | خروج از کلاس |
| GET | `/api/get-messages` | دریافت پیام‌ها |
| POST | `/api/send-message` | ارسال پیام |
| POST | `/api/upload-file` | آپلود فایل |
| GET | `/files/:key` | دانلود فایل |
| GET | `/api/get-whiteboard` | دریافت تخته سفید |
| POST | `/api/update-whiteboard` | ذخیره تخته سفید |
| POST | `/api/set-meeting-link` | تنظیم لینک جلسه |
| GET | `/api/get-meeting-link` | دریافت لینک جلسه |
| GET | `/manifest.json` | Manifest برنامه PWA |
| GET | `/sw.js` | Service Worker |

## 🚀 استقرار

```bash
git clone https://github.com/naderuser/panelteacher.git
cd panelteacher
wrangler deploy
```

## ⚙️ متغیرهای محیطی

| متغیر | توضیح |
|--------|-------|
| `TEACHER_PASS` | رمز عبور معلم |

---
ساخته شده با ❤️ برای آموزش