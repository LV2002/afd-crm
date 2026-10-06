#!/usr/bin/env python3
"""
Checks prepared import files against what the CRM will actually accept.

    python3 scripts/import-prep/check-import-files.py <folder-of-prepared-files>

The importer never fails a row for a bad dropdown value: it drops the
value, warns, and carries on (see lib/leads/coerce-import-value.ts). That
is the right behaviour at import time and the wrong thing to find out
afterwards across a thousand leads, so every value is checked here first,
while the file can still be regenerated.

The option lists below are the CRM's own, plus the ones added for this
import. If a check fails on a source, course or exam, either the file is
wrong or that option has not been added in Settings → Dropdowns yet.
"""

import csv
import os
import re
import sys
from collections import Counter

SOURCES = {
    # shipped
    "Meta", "Google", "Website", "Walk-in", "Referral", "Purchased Database",
    "Knorish", "WhatsApp", "Instagram", "Other",
    # added for this import, confirmed with the client
    "Shiksha", "JustDial", "School Seminar", "Event", "Brochure",
}
EXAMS = {
    "NID", "NIFT UG", "NIFT MDes", "UCEED", "CEED", "NATA", "JEE Paper 2",
    "NID PG", "BFA", "NIFT PG", "B.Arch", "KS DAT", "KEAM",
}
COURSES = {
    "Foundation", "DWO", "DAO", "DRH", "Crash", "Repeat Batch", "MDes", "Consultancy",
    "DWH", "DAH", "ARH", "AWO",
}
EDUCATION = {"10th", "11th", "12th", "12th Pass", "Diploma", "Graduate", "Other"}
TEMPERATURES = {"Hot", "Warm", "Cold", "Dead"}
MODES = {"Online", "Offline", "Hybrid"}
CENTRES = {"Kochi", "Kannur"}

EXPECTED_HEADER = [
    "Student Name", "Father's Name", "Primary Phone", "Alternate Phone", "Email",
    "Date of Birth", "City", "State", "State (specify)", "District", "Pincode",
    "Parents' Occupation", "Education Status", "School / College", "Previous Attempts",
    "Competitor Student?", "Competitor Institute", "Interested Exams", "Exam Year",
    "Courses Interested", "Preferred Mode", "Lead Source", "Sub-source", "Temperature",
    "Centre", "Next Follow-up", "Brochure Sent", "Notes",
]

SINGLE = {
    "Lead Source": SOURCES, "Education Status": EDUCATION, "Temperature": TEMPERATURES,
    "Preferred Mode": MODES, "Centre": CENTRES,
}
MULTI = {"Interested Exams": EXAMS, "Courses Interested": COURSES}

problems = []
phones = Counter()
rows_total = 0


def check(path):
    global rows_total
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != EXPECTED_HEADER:
            missing = set(EXPECTED_HEADER) - set(reader.fieldnames or [])
            extra = set(reader.fieldnames or []) - set(EXPECTED_HEADER)
            problems.append(f"{os.path.basename(path)}: header differs — missing {sorted(missing)}, extra {sorted(extra)}")
            return
        rows = list(reader)

    name = os.path.basename(path)
    rows_total += len(rows)
    for index, row in enumerate(rows, start=2):
        where = f"{name} row {index}"
        if not row["Student Name"].strip():
            problems.append(f"{where}: no student name — the row would be skipped")
        phone = row["Primary Phone"].strip()
        if not re.fullmatch(r"\+\d{8,15}", phone):
            problems.append(f"{where}: {phone!r} is not E.164 — the row would be skipped")
        else:
            phones[phone] += 1
        alternate = row["Alternate Phone"].strip()
        if alternate and not re.fullmatch(r"\+\d{8,15}", alternate):
            problems.append(f"{where}: alternate {alternate!r} is not E.164")
        for column, allowed in SINGLE.items():
            value = row[column].strip()
            if value and value not in allowed:
                problems.append(f"{where}: {column} = {value!r} is not an option the CRM has")
        for column, allowed in MULTI.items():
            for token in [t.strip() for t in row[column].split(",") if t.strip()]:
                if token not in allowed:
                    problems.append(f"{where}: {column} = {token!r} is not an option the CRM has")
        year = row["Exam Year"].strip()
        if year and not re.fullmatch(r"20\d\d", year):
            problems.append(f"{where}: Exam Year = {year!r}")
        email = row["Email"].strip()
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", email):
            problems.append(f"{where}: Email = {email!r}")
    print(f"  {name:42} {len(rows):5} rows")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    folder = sys.argv[1]
    files = sorted(f for f in os.listdir(folder) if f.startswith("afd-import-") and f.endswith(".csv"))
    if not files:
        sys.exit(f"No afd-import-*.csv files in {folder}")

    print("Checking:")
    for name in files:
        check(os.path.join(folder, name))

    repeated = {phone: n for phone, n in phones.items() if n > 1}
    print(f"\n{rows_total} rows, {len(phones)} distinct phone numbers.")
    if repeated:
        # Not a problem: the CRM attaches a repeat enquiry to the person who
        # already exists (CLAUDE.md, "never reject a duplicate"). Worth
        # printing so the import's "matched" count is not a surprise.
        print(f"{sum(repeated.values()) - len(repeated)} rows share a number with another row "
              f"and will attach to an existing lead rather than create one.")

    if problems:
        print(f"\n{len(problems)} problems:")
        for line in problems[:60]:
            print(f"  {line}")
        if len(problems) > 60:
            print(f"  … and {len(problems) - 60} more")
        sys.exit(1)
    print("\nEvery value in every file is one the CRM accepts.")


main()
