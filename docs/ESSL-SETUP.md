# Connecting the eSSL biometric device

## The short version
Your laptop is the courier today: it reaches the device over the LAN, downloads the punches into the eSSL software, and you run the
report from there. The CRM lives on the internet and **cannot reach into your office network**, so it cannot "go and fetch" from the
device. Something inside your office has to send the punches out. There are three ways, from least to most effort.

| | What you do once | After that |
|---|---|---|
| **A. The device pushes by itself** (best, if it can) | Tell the device the CRM's address, register its serial here | Fully automatic. The laptop is not needed. |
| **B. A small script on the office PC** | Install the script on the PC that runs the eSSL software, schedule it | Automatic while that PC is on and the software keeps downloading |
| **C. Upload the export** | Nothing to install | You export a CSV and upload it (a minute, once a week or month) |

You only need one. All three end in the same place, a punch is never stored twice, and mixing them is safe.

## A. The device pushes by itself (ADMS / cloud server)
Many eSSL and ZKTeco-family devices have a **Cloud Server** (also called ADMS or Web Server) setting. The device then sends each
punch to a server address over its own internet connection, with no PC involved.

1. On the device: **Menu → Comm. (Communication) → Cloud Server Setting** (the name varies by model).
2. **Server address:** the CRM's domain (for example `crm.afdindia.com`). **Port:** 443 if the device supports HTTPS, otherwise 80.
   Turn on **Enable domain name** if there is such an option.
3. In the CRM: **HR → Attendance → Setup → Devices**, enter the device's **serial number** (Menu → System Info → Device Info) and register it.
4. The device connects within a minute or two. **Last seen** next to the device on that page shows when it last spoke to the CRM.

If the device has no Cloud Server option, or only supports plain HTTP and your CRM domain redirects to HTTPS, use B or C.
**This route is written from the protocol and tested in parts; it has not been tried on a real eSSL device yet, so watch the first
connection and tell me what the device does.**

## B. A script next to the eSSL software
The eSSL software keeps the punches in a database on the PC. A small script reads the new ones every 15 minutes and sends them to the CRM.

1. HR → Attendance → Setup → **Relay key** → make a key and copy it (shown once).
2. Copy `scripts/essl-relay/relay.py` to the PC with the eSSL software. It needs Python, `pip install pyodbc requests`.
3. Open the eSSL database in SQL Server Management Studio, find the table that holds the punches, and set `QUERY` in the script to match.
   **The script is a template: I have not seen your database, so this step is yours (or your IT person's).**
4. Set `CRM_URL`, `CRM_KEY`, `ESSL_DSN`, and schedule it with Windows Task Scheduler every 15 minutes.
5. The software still has to download from the device: turn on its **auto download** option, or leave the PC to do it.

You can also post the software's CSV export straight to `/api/webhooks/essl` (header `Authorization: Bearer <key>`, content type `text/csv`).

## C. Upload the export
In the eSSL software export the raw punch log (employee code, date, time) as CSV. In the CRM: **HR → Attendance → Import punches**.
Overlapping exports are fine.

## Then, every month
1. **Codes.** Each employee needs their **biometric code** (their number on the device) on their employee page. Codes the device sends
   that belong to nobody are listed on the Attendance page to assign.
2. **Working week.** On each employee's page set which days they work and from when to when. Late coming and early exit are measured
   against that, not one company-wide shift.
3. **Review.** On the 1st HR and accounts are told payroll is ready. **HR → Payroll → Review and generate the month** shows each person's
   preview from approved leave and punches, and what looks odd.
4. **Correct.** On the Attendance page mark a day: *count as present* (the device missed them), *comp-off*, *excuse late/early*, or *worked on
   a day off* (earns a comp-off). Each mark needs a reason and is kept with who made it.
5. **Generate** the whole list, or open anyone to add overtime, an advance or a correction. The owner approves; then pay.

Nothing is generated or paid without a person looking first.
