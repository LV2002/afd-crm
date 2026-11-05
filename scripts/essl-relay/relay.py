#!/usr/bin/env python3
"""
Sends new punches from the eSSL software's database to the CRM.

Run it on the office PC that has the eSSL software (the one the device is
downloaded into), on a schedule (Windows Task Scheduler, every 15 minutes).
It remembers the time of the last punch it sent, so each run only sends what
is new, and a punch the CRM already has is ignored on its side.

THIS IS A TEMPLATE. It has not been run against your database. The table and
column names below are what eTimeTrackLite-style installations usually use;
open the database in SQL Server Management Studio and change QUERY to match.

    pip install pyodbc requests
    set CRM_URL=https://your-crm-domain
    set CRM_KEY=afd_...            (made on HR > Attendance > Setup > Relay key)
    set ESSL_DSN=DRIVER={SQL Server};SERVER=.\\SQLEXPRESS;DATABASE=etimetracklite1;Trusted_Connection=yes
"""
import json
import os
import sys

import pyodbc
import requests

STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "last_sync.txt")

# One row per punch: the employee's code on the device, and when. Change the
# table name (monthly tables are often DeviceLogs_<month>_<year>) and columns.
QUERY = """
    SELECT UserId, LogDate
    FROM DeviceLogs_{month}_{year}
    WHERE LogDate > ?
    ORDER BY LogDate
"""


def last_sync() -> str:
    try:
        return open(STATE).read().strip()
    except FileNotFoundError:
        return "2000-01-01 00:00:00"


def main() -> int:
    from datetime import datetime

    now = datetime.now()
    conn = pyodbc.connect(os.environ["ESSL_DSN"])
    since = last_sync()
    rows = conn.cursor().execute(QUERY.format(month=now.month, year=now.year), since).fetchall()
    if not rows:
        print("Nothing new.")
        return 0

    punches = [{"code": str(r[0]), "time": r[1].strftime("%Y-%m-%d %H:%M:%S")} for r in rows]
    for i in range(0, len(punches), 5000):
        resp = requests.post(
            os.environ["CRM_URL"].rstrip("/") + "/api/webhooks/essl",
            headers={"Authorization": "Bearer " + os.environ["CRM_KEY"], "Content-Type": "application/json"},
            data=json.dumps({"punches": punches[i : i + 5000]}),
            timeout=60,
        )
        if resp.status_code != 200:
            # Keep the old marker so the next run tries again.
            print("The CRM refused:", resp.status_code, resp.text)
            return 1
        print(resp.json())

    open(STATE, "w").write(punches[-1]["time"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
