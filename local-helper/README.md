# Local Helper — Setup Guide

This small program runs on your PC and automates the FTP download + upload step,
so you don't have to manually save and drag-drop files every day.

## One-time setup

1. **Install Python** (if not already installed): https://www.python.org/downloads/
   - During installation, tick the box "Add Python to PATH".
2. **Install the one required library** — open Command Prompt in this folder and run:
   ```
   pip install -r requirements.txt
   ```
3. **Create your config file**:
   - Copy `config.example.json` and rename the copy to `config.json`
   - Fill in:
     - `ftp.password` — your actual FTP password
     - `ftp.folder_paths` — ⚠️ **please verify these** — I've assumed `/billed` and
       `/unbilled` as folder names based on your description, but the real folder
       path on the FTP server may be different (e.g. it might be nested by date
       or by division). Browse the FTP manually once via VPN and note the exact
       folder path, then update this file.
     - `app_upload_url` — once your app is deployed (e.g. to Render), put its
       upload address here: `https://your-app-name.onrender.com/api/upload`

## Daily use

1. Connect your company VPN as usual.
2. Double-click `run_helper.bat` (Windows).
3. It downloads today's 4 files and uploads them to the app automatically.
4. Check the Admin > Upload tab in the web app to confirm.

## If something doesn't match

The FTP folder structure was described but not directly inspected, so
`fetch_reports.py` may need small adjustments (folder path, filename pattern)
the first time it's actually run against the real server. This is expected —
flag any error message you see and it can be adjusted quickly.

## Fallback

If the helper isn't run on a given day (VPN issue, PC off, etc.), you can still
upload the 4 files manually any time via the Admin > Upload Reports tab in the
web app — the helper is a convenience layer, not a hard dependency.
