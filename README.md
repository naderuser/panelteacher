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

## 🗄️ نصب KV (فضای ذخیره‌سازی)

### ۱. ساخت KV namespace
```bash
wrangler kv:namespace create "CLASS_KV"
```
خروجی یک `id` خواهد بود مثل:
```
{n binding = "CLASS_KV", id = "abc123..."}
```

### ۲. اضافه کردن به wrangler.toml
```toml
kv_namespaces = [
  { binding = "CLASS_KV", id = "abc123..." }
]
```

### ۳. استقرار
```bash
wrangler deploy
```

---

## 🗃️ نصب D1 (دیتابیس SQLite)

### ۱. ساخت دیتابیس D1
```bash
wrangler d1 create class_db
```
خروجی یک `database_id` خواهد بود.

### ۲. اضافه کردن به wrangler.toml
```toml
[[d1_databases]]
binding = "DB"
database_name = "class_db"
database_id = "xyz789..."
```

### ۳. ساخت جدول‌ها
```sql
-- ساخت فایل schema.sql
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT,
  user TEXT,
  role TEXT,
  content TEXT,
  time INTEGER
);
```

### ۴. اجرای migrations
```bash
wrangler d1 migrations apply class_db --local
wrangler d1 migrations apply class_db --remote
```

### ۵. استقرار
```bash
wrangler deploy
```

---

## 🚀 استقرار کامل

```bash
# 1. کلون پروژه
git clone https://github.com/naderuser/panelteacher.git
cd panelteacher

# 2. نصب KV
wrangler kv:namespace create "CLASS_KV"
# اضافه کردن binding به wrangler.toml

# 3. نصب D1 (اختیاری)
wrangler d1 create class_db
# اضافه کردن binding به wrangler.toml

# 4. استقرار
wrangler deploy
```

---
ساخته شده با ❤️ برای آموزش