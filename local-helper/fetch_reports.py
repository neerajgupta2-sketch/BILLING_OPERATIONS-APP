"""
Local Helper — Billing Operations App
--------------------------------------
Run this on your PC AFTER connecting the company VPN.

What it does:
1. Logs into the FTP server using your saved credentials
2. Finds today's 4 report files (Billed + Unbilled, both divisions)
3. Downloads them temporarily
4. Uploads them straight to your web app (no manual save/upload needed)

SETUP (one-time):
1. Install Python 3 if you don't have it: https://www.python.org/downloads/
   During install, tick "Add Python to PATH".
2. Open Command Prompt in this folder and run:
       pip install requests
3. Copy config.example.json to config.json and fill in your details.
4. Double-click run_helper.bat (Windows) each day after connecting VPN,
   or run: python fetch_reports.py

If FTP folders/paths differ from what's assumed here, tell your developer/architect
so the FTP_PATHS below can be adjusted — this is the ONE file that may need
tweaking if your FTP folder structure is different from what was described.
"""

import ftplib
import gzip
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime

import requests

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')


def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f"ERROR: {CONFIG_FILE} not found.")
        print("Copy config.example.json to config.json and fill in your FTP + app details.")
        sys.exit(1)
    with open(CONFIG_FILE) as f:
        return json.load(f)


def build_gz_filename(report_type, division, date_str):
    # Real files on FTP look like: BILLED_DVVNL_DIV233511_05072026.csv.gz
    return f"{report_type}_DVVNL_{division}_{date_str}.csv.gz"


def fetch_from_ftp(cfg, date_str):
    """
    Real FTP layout (confirmed by browsing manually):
        03_CSV_BILLED/<DDMMYYYY>/BILLED_DVVNL_DIV<code>_<DDMMYYYY>.csv.gz
        04_CSV_UNBILLED/<DDMMYYYY>/UNBILLED_DVVNL_DIV<code>_<DDMMYYYY>.csv.gz
    Each dated folder contains files for ALL divisions (not just yours) --
    we only download the ones matching cfg['divisions'].
    Files are gzip-compressed, so we decompress them locally before uploading.
    """
    host = cfg['ftp']['host']
    user = cfg['ftp']['username']
    password = cfg['ftp']['password']
    base_folders = cfg['ftp']['folder_paths']  # e.g. {"BILLED": "03_CSV_BILLED", "UNBILLED": "04_CSV_UNBILLED"}
    divisions = cfg['divisions']  # e.g. ["DIV233511", "DIV233512"]

    tmpdir = tempfile.mkdtemp(prefix='billing_reports_')
    downloaded = []  # decompressed .csv paths, ready to upload

    print(f"Connecting to FTP: {host} ...")
    ftp = ftplib.FTP(host, timeout=60)
    ftp.login(user, password)
    print("Connected.")

    for report_type in ['BILLED', 'UNBILLED']:
        base_folder = base_folders.get(report_type, '')
        dated_folder = f"{base_folder}/{date_str}"
        for division in divisions:
            gz_filename = build_gz_filename(report_type, division, date_str)
            remote_path = f"{dated_folder}/{gz_filename}"
            local_gz_path = os.path.join(tmpdir, gz_filename)
            local_csv_path = local_gz_path[:-3]  # strip ".gz"
            try:
                print(f"  Downloading {remote_path} ...")
                with open(local_gz_path, 'wb') as f:
                    ftp.retrbinary(f"RETR {remote_path}", f.write)
                # Decompress
                with gzip.open(local_gz_path, 'rb') as f_in, open(local_csv_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
                downloaded.append(local_csv_path)
                print(f"  OK: {gz_filename} (decompressed)")
            except ftplib.all_errors as e:
                print(f"  NOT FOUND or ERROR for {gz_filename}: {e}")
            except OSError as e:
                print(f"  Downloaded but failed to decompress {gz_filename}: {e}")

    ftp.quit()
    return downloaded


def upload_to_app(cfg, file_paths):
    if not file_paths:
        print("No files were downloaded — nothing to upload.")
        return
    app_url = cfg['app_upload_url']  # e.g. https://your-app.onrender.com/api/upload
    files = [('files', (os.path.basename(p), open(p, 'rb'), 'text/csv')) for p in file_paths]
    print(f"Uploading {len(files)} file(s) to {app_url} ...")
    resp = requests.post(app_url, files=files, timeout=180)
    print(f"Server responded: HTTP {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text[:500])


def main():
    cfg = load_config()
    date_str = datetime.now().strftime('%d%m%Y')
    print(f"=== Billing Reports Fetch — {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")
    print("Make sure your company VPN is connected before continuing.\n")

    files = fetch_from_ftp(cfg, date_str)
    upload_to_app(cfg, files)

    print("\nDone. Check the Admin > Upload tab in the web app to confirm today's data is in.")


if __name__ == '__main__':
    main()
   
