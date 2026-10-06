#!/usr/bin/env python3
"""
Turns AFD India's four historic lead sheets into the CRM's import format.

    python3 scripts/import-prep/prepare-afd-sheets.py <folder-of-sheets> <output-folder>

The four sheets are a main enquiry register kept by hand since 2025, a
Google Ads export, a Meta Lead Ads export and a website-forms log. They
disagree about everything: column names, phone formats, how an exam is
spelled, what counts as a source. This writes one file per sheet in the
column order the CRM's import template uses, plus two review files for
rows that cannot be imported and rows that are not real leads.

Nothing here is clever. It is a long list of decisions about one
institute's data, written down where they can be read and corrected,
rather than made silently in a spreadsheet nobody can audit afterwards.
Every mapping below was confirmed with the client before it was applied;
anything that was not confirmed is left in the note rather than guessed
into a field.
"""

import csv
import difflib
import os
import re
import sys
from collections import Counter

# The import template's columns, in its order. `Notes` is last and is not
# a lead field — the importer logs it as a note on the lead's timeline.
COLUMNS = [
    "Student Name", "Father's Name", "Primary Phone", "Alternate Phone", "Email",
    "Date of Birth", "City", "State", "State (specify)", "District", "Pincode",
    "Parents' Occupation", "Education Status", "School / College", "Previous Attempts",
    "Competitor Student?", "Competitor Institute", "Interested Exams", "Exam Year",
    "Courses Interested", "Preferred Mode", "Lead Source", "Sub-source", "Temperature",
    "Centre", "Next Follow-up", "Brochure Sent", "Notes",
]

CENTRE = "Kochi"

report = Counter()
unmapped = {"source": Counter(), "education": Counter(), "exam": Counter(), "course": Counter()}


# --------------------------------------------------------------------------
# Phone
# --------------------------------------------------------------------------

def normalise_phone(raw):
    """A port of src/lib/identity/normalize-phone.ts, so this file only ever
    contains numbers the importer will accept. Anything it returns None for
    would be skipped at import time with 'unrecognisable phone number', and
    is better caught here where somebody can look it up."""
    if not raw:
        return None
    trimmed = raw.strip()
    plus = trimmed.startswith("+")
    digits = re.sub(r"\D", "", trimmed)
    if not digits:
        return None
    if plus:
        out = "+" + digits
    elif len(digits) == 10:
        out = "+91" + digits
    elif len(digits) == 11 and digits.startswith("0"):
        out = "+91" + digits[1:]
    elif len(digits) == 12 and digits.startswith("91"):
        out = "+" + digits
    elif len(digits) == 14 and digits.startswith("0091"):
        out = "+91" + digits[4:]
    else:
        return None
    return out if re.fullmatch(r"\+\d{8,15}", out) else None


def split_phones(*raws):
    """First usable number is the primary, second is the alternate. Sheets
    put two numbers in one cell often enough to be worth splitting."""
    found = []
    for raw in raws:
        for piece in re.split(r"[/,;&]| and ", raw or ""):
            n = normalise_phone(piece)
            if n and n not in found:
                found.append(n)
    return (found + [None, None])[:2]


# --------------------------------------------------------------------------
# Names and other free text
# --------------------------------------------------------------------------

LOWER_PARTICLES = {"bin", "bint", "al", "el", "de", "da", "van", "der"}

def clean_name(raw):
    if not raw:
        return ""
    name = re.sub(r"\s+", " ", raw.strip().strip(".,-")).strip()
    name = re.sub(r"\s*\(.*?\)\s*", " ", name).strip()
    if not name:
        return ""
    # Title case, but leave a name that is already mixed case alone — "McKenzie"
    # and "VP Sinan" are both more likely right than what .title() would do.
    if name.isupper() or name.islower():
        parts = []
        for word in name.split(" "):
            parts.append(word if word.lower() in LOWER_PARTICLES else word.capitalize())
        name = " ".join(parts)
    return re.sub(r"\s+", " ", name).strip()


def clean_text(raw):
    return re.sub(r"\s+", " ", (raw or "").strip())


def clean_email(raw):
    value = clean_text(raw).lower()
    return value if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", value) else ""


# --------------------------------------------------------------------------
# Education status  ->  10th | 11th | 12th | 12th Pass | Diploma | Graduate | Other
# --------------------------------------------------------------------------

def education_status(raw):
    v = clean_text(raw).lower().replace(".", "").replace("_", " ")
    if not v or v in ("-", "na", "n/a", "yes", "no"):
        return ""
    if v == "other":
        return "Other"
    if re.search(r"\b(9th|8th|7th)\b", v):
        return "Other"
    # A degree, finished or in progress. The client's own example: "bcom
    # instead of graduate". A degree still being read is still the nearest
    # true answer the CRM offers.
    if re.search(r"\b(b ?tech|btech|b ?com|bcom|b ?sc|bsc|b ?a\b|ba\b|bba|bca|bfa|b ?des|bdes|b ?arch|barch|degree|graduate|graduation|bachelor|masters?|mba|mca|ca\b|college|engineering|nursing|multimedia|fashion technology)\b", v):
        return "Graduate"
    if re.search(r"\b(1st|2nd|3rd|final) ?(yr|year)\b", v) or re.search(r"\bpg\b", v):
        return "Graduate"
    if re.search(r"(b ?voc|bsw|m ?tech|mtech|llb|pharm|radiology|bfds|b ?ftech|bf ?tech)", v):
        return "Graduate"
    if "diplo" in v or "deplo" in v or re.search(r"\biti\b", v):
        return "Diploma"
    # 12th: "12th pass", "12 complete", "plus two", "+2", "higher secondary"
    if re.search(r"(12\s*th|12t|2th|1?2\b|\+ ?2|plus ?two|plustwo|hsc|higher secondary|hse)", v):
        done = re.search(r"(pass|complete|completed|over|done|finished|failed|pas\b|drop)", v)
        return "12th Pass" if done else "12th"
    if re.search(r"(11\s*th|1 ?th|\+ ?1|plus ?one|plusone|\b11\b)", v):
        return "11th"
    if re.search(r"(10\s*th|\b10\b|high ?school|sslc)", v):
        return "10th"
    unmapped["education"][clean_text(raw)] += 1
    return ""


# --------------------------------------------------------------------------
# Exams  (the six new options were confirmed with the client)
# --------------------------------------------------------------------------

EXAM_PATTERNS = [
    (r"nid\s*(m ?des|pg|mdes)", "NID MDes"),
    # NIFT's postgraduate programmes are named, not numbered: somebody
    # writing "mfm" or "m f tech" is naming a NIFT PG entrance.
    (r"\bmfm\b|m ?f ?tech", "NIFT PG"),
    (r"b ?f ?tech", "NIFT UG"),
    (r"nift\s*(m ?des|mdes)", "NIFT MDes"),
    (r"nift\s*(pg)", "NIFT PG"),
    (r"nift|nft", "NIFT UG"),
    (r"nid", "NID"),
    (r"uceed", "UCEED"),
    (r"ceed", "CEED"),
    (r"nata", "NATA"),
    (r"jee|b ?arch\s*jee", "JEE Paper 2"),
    (r"b ?arch|barch", "B.Arch"),
    (r"bfa", "BFA"),
    (r"ks ?dat|kerala ?dat", "KS DAT"),
    (r"keam", "KEAM"),
]

def exams(raw):
    v = clean_text(raw).lower()
    if not v or v in ("-", "--", "na", "n/a"):
        return ""
    found = []
    # "nid /niftug", "nift.nid ug", "NATA/JEE" — split on anything that is
    # not part of a name, then also scan the whole string, because "nid ug"
    # is two tokens and "natajee" is none.
    pieces = [p for p in re.split(r"[/,.|&+\s]+", v) if p] + [v]
    for piece in pieces:
        for pattern, label in EXAM_PATTERNS:
            if re.search(pattern, piece) and label not in found:
                found.append(label)
                break
    if not found:
        unmapped["exam"][clean_text(raw)] += 1
    return ", ".join(found)


# --------------------------------------------------------------------------
# Courses  (DWH, DAH, ARH, AWO confirmed as new options; the test series,
# materials and short programmes stay in the note, also confirmed)
# --------------------------------------------------------------------------

COURSE_CODES = {
    "drh": "DRH", "dwo": "DWO", "dao": "DAO", "dwh": "DWH", "dah": "DAH",
    "arh": "ARH", "awo": "AWO", "crash": "Crash", "foundation": "Foundation",
    "consultancy": "Consultancy", "mdes": "MDes", "repeat": "Repeat Batch",
}

def courses(raw):
    v = clean_text(raw).lower()
    if not v:
        return ""
    found = []
    for piece in [p for p in re.split(r"[/,.|&+\s-]+", v) if p]:
        code = piece.strip("?()")
        label = COURSE_CODES.get(code)
        if label and label not in found:
            found.append(label)
    return ", ".join(found)


# --------------------------------------------------------------------------
# Source  (every one of these was confirmed with the client)
# --------------------------------------------------------------------------

def source_for(raw):
    """Returns (Lead Source, Sub-source). The original wording always
    survives in the sub-source, so a mapping decided here can be unpicked
    later from the data itself."""
    v = clean_text(raw).lower()
    original = clean_text(raw)
    if not v:
        return "Other", "Source not recorded in the enquiry sheet"
    if "shiksha" in v:
        return "Shiksha", original
    if "just dial" in v or "justdial" in v:
        return "JustDial", original
    if "adword" in v or "google" in v:
        return "Google", original
    if "school seminar" in v or "school visit" in v or "seminar" in v:
        return "School Seminar", original
    if "callback" in v:
        return "Website", original
    if "website" in v or "web site" in v or "webite" in v:
        return "Website", original
    if v.startswith("wom") or v.startswith("wm-") or v.startswith("wm ") or "word of mouth" in v:
        return "Referral", original
    if "afdian" in v or "old student" in v or "student" in v:
        return "Referral", original
    if "relative" in v or "realtive" in v or "friend" in v or "referr" in v or "sister" in v or "brother" in v:
        return "Referral", original
    if "insta" in v:
        return "Instagram", original
    if "fb" in v or "facebook" in v or "meta" in v:
        return "Meta", original
    if "brochure" in v or "broshure" in v or "brichure" in v or "brochur" in v:
        return "Brochure", original
    if "event" in v or "expo" in v or "fair" in v or "mariett" in v:
        return "Event", original
    if "scholarship" in v or "schlarship" in v:
        return "Website", original
    if "walk" in v or "office" in v:
        return "Walk-in", original
    if "whatsapp" in v or "wa\b" in v:
        return "WhatsApp", original
    if "email" in v or "mail" in v:
        return "Other", original
    if "old enq" in v or "very old" in v:
        return "Other", original
    unmapped["source"][original] += 1
    return "Other", original


# --------------------------------------------------------------------------
# Temperature
# --------------------------------------------------------------------------

DEAD_MARKERS = ("n/r", "dropped", "irrelevant", "registered", "not interested",
                "wrong number", "no response", "closed", "joined elsewhere")

def temperature_from_status(raw):
    v = clean_text(raw).lower()
    if not v:
        return ""
    if v in ("hot",):
        return "Hot"
    if v in ("warm",):
        return "Warm"
    if v in ("cold",):
        return "Cold"
    if "wrong target" in v or "negative" in v or "took admission" in v or "student" in v:
        return "Dead"
    for marker in DEAD_MARKERS:
        if marker in v:
            return "Dead"
    if v == "weak":
        return "Cold"
    return ""


# --------------------------------------------------------------------------
# Districts / places
# --------------------------------------------------------------------------

DISTRICTS = [
    "Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam",
    "Idukki", "Ernakulam", "Thrissur", "Palakkad", "Malappuram", "Kozhikode",
    "Wayanad", "Kannur", "Kasaragod",
]
DISTRICT_ALIASES = {
    "kochi": "Ernakulam", "cochin": "Ernakulam", "ernakulam": "Ernakulam",
    "aluva": "Ernakulam", "kakkanad": "Ernakulam", "edappally": "Ernakulam",
    "perumbavoor": "Ernakulam", "muvattupuzha": "Ernakulam", "angamaly": "Ernakulam",
    "calicut": "Kozhikode", "kozhikode": "Kozhikode", "trivandrum": "Thiruvananthapuram",
    "tvm": "Thiruvananthapuram", "trichur": "Thrissur", "thrissur": "Thrissur",
    "alleppey": "Alappuzha", "quilon": "Kollam", "palghat": "Palakkad",
    "nilambur": "Malappuram", "manjeri": "Malappuram", "tirur": "Malappuram",
    "valanchery": "Malappuram", "kanhangad": "Kasaragod", "thalassery": "Kannur",
    "payyannur": "Kannur", "irinjalakuda": "Thrissur", "chalakudy": "Thrissur",
    "changanassery": "Kottayam", "pala": "Kottayam", "thodupuzha": "Idukki",
    "adoor": "Pathanamthitta", "thiruvalla": "Pathanamthitta", "kayamkulam": "Alappuzha",
    "cherthala": "Alappuzha", "guruvayur": "Thrissur", "ottapalam": "Palakkad",
    "kalpetta": "Wayanad", "sulthan bathery": "Wayanad", "attingal": "Thiruvananthapuram",
}

def place(raw):
    """Returns (City, District, State). Only names it is sure of become a
    district: a wrong district is worse than an empty one, because the
    assignment rules read it."""
    city = clean_name(raw)
    if not city:
        return "", "", ""
    key = city.lower().strip()
    for name in DISTRICTS:
        if name.lower() in key:
            return city, name, "Kerala"
    district = DISTRICT_ALIASES.get(key)
    if district:
        return city, district, "Kerala"
    for alias, name in DISTRICT_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", key):
            return city, name, "Kerala"
    # "Alleppy", "Trissur", "Eranakulam" — a register kept by hand for two
    # years spells every town several ways. A close match to a district or
    # a known town is better than an empty district, which the assignment
    # rules read; 0.86 is tight enough that "Kollam" and "Kollur" stay
    # apart, which a looser cutoff did not.
    candidates = {d.lower(): d for d in DISTRICTS}
    candidates.update({alias: name for alias, name in DISTRICT_ALIASES.items()})
    close = difflib.get_close_matches(key, list(candidates), n=1, cutoff=0.86)
    if close:
        return city, candidates[close[0]], "Kerala"
    return city, "", ""


# --------------------------------------------------------------------------
# Notes
# --------------------------------------------------------------------------

def note_block(pairs):
    """One note per lead, labelled line by line. Blank values are dropped
    rather than printed as empty headings."""
    lines = []
    for label, value in pairs:
        value = clean_text(value)
        if not value or value in ("-", "--", "na", "NA", "N/A"):
            continue
        lines.append(f"{label}: {value}" if label else value)
    return "\n".join(lines)


def blank_row():
    return {column: "" for column in COLUMNS}


def write_csv(path, rows, columns=None):
    columns = columns or COLUMNS
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    print(f"  {os.path.basename(path):42} {len(rows):5} rows")


def read_sheet(folder, name):
    """Column names are stripped on the way in. The main sheet's name column
    is headed "Name " with a trailing space, which is invisible in a
    spreadsheet and silently matches nothing here — it cost every row of the
    first run."""
    with open(os.path.join(folder, name), newline="", encoding="utf-8-sig") as fh:
        rows = []
        for raw in csv.DictReader(fh):
            rows.append({(k.strip() if isinstance(k, str) else k): v for k, v in raw.items()})
        return rows


# --------------------------------------------------------------------------
# Sheet 1 — the main enquiry register
# --------------------------------------------------------------------------

def main_sheet(rows, rejects):
    out = []
    for index, r in enumerate(rows, start=2):
        name = clean_name(r.get("Name"))
        primary, alternate = split_phones(r.get("phone"), r.get("Alternate number"))
        status = clean_text(r.get("`"))

        if not name or not primary:
            rejects.append({
                "Sheet": "Main enquiry sheet", "Row": index, "Name": clean_text(r.get("Name")),
                "Phone as written": clean_text(r.get("phone")), "Email": clean_text(r.get("email")),
                "Why it cannot be imported": "No name" if not name else "No usable phone number",
                "Everything else on the row": note_block([
                    ("Source", r.get("Source")), ("Exam", r.get("EXAM")), ("Course", r.get("COURSE")),
                    ("Place", r.get("Place")), ("Conversation", r.get("Conversation Details")),
                ]),
            })
            continue

        row = blank_row()
        source, sub_source = source_for(r.get("Source"))
        city, district, state = place(r.get("Place"))
        exam_year = re.sub(r"\D", "", clean_text(r.get("exam year")))[:4]
        previous = clean_text(r.get("Previous attempt")).lower()
        competitor = clean_text(r.get("Competitor details"))

        row.update({
            "Student Name": name,
            "Primary Phone": primary,
            "Alternate Phone": alternate or "",
            "Email": clean_email(r.get("email")),
            "City": city, "District": district, "State": state,
            "Parents' Occupation": clean_text(r.get("Parents Occupation")),
            "Education Status": education_status(r.get("Current Education Status")),
            "School / College": clean_text(r.get("Name of School or College (current or last attended)")),
            "Previous Attempts": "1" if previous.startswith("yes") else ("0" if previous.startswith("no") else ""),
            "Competitor Student?": "yes" if competitor else "",
            "Competitor Institute": competitor,
            "Interested Exams": exams(r.get("EXAM")),
            "Exam Year": exam_year if re.fullmatch(r"20\d\d", exam_year) else "",
            "Courses Interested": courses(r.get("COURSE")),
            "Lead Source": source,
            "Sub-source": sub_source,
            "Temperature": temperature_from_status(status),
            "Centre": CENTRE,
            "Notes": note_block([
                ("", f"Imported from the main enquiry sheet, row {index}."),
                ("Enquiry date", r.get("24-Sep-2026")),
                ("Status in the sheet", status),
                ("Conversation", r.get("Conversation Details")),
                ("Comments", r.get("Comments")),
                ("1st follow-up", r.get("1st Follow up")),
                ("2nd follow-up", r.get("2nd Follow up")),
                ("3rd follow-up", r.get("3rd Follow up")),
                ("Demo / visit / test", r.get("demo/ walk in/ apt test/ scholarship")),
                ("Course as written", r.get("COURSE")),
                ("Exam as written", r.get("EXAM")),
                ("Education as written", r.get("Current Education Status")),
                ("Previous attempt", r.get("Previous attempt")),
                ("Contacted on", r.get("Contacted on")),
                ("Instagram", r.get("Instagram")),
                ("Postal address for brochure", r.get("Postal Address to send brochure")),
                ("NIFT roll no", r.get("NIFT roll no.")),
            ]),
        })
        out.append(row)
    return out


# --------------------------------------------------------------------------
# Sheet 2 — Google Ads
# --------------------------------------------------------------------------

def google_sheet(rows, rejects):
    out = []
    for index, r in enumerate(rows, start=2):
        name = clean_name(r.get("Name"))
        primary, alternate = split_phones(r.get("Student Contact Number "), r.get("Student Contact Number"))
        landing = clean_text(r.get("Campaign"))
        campaign = ""
        found = re.search(r"utm_campaign=([^&]+)", landing)
        if found:
            campaign = found.group(1).replace("_", " ")
        exam_from_url = ""
        page = re.search(r"campaign\.afdindia\.com/(\w+)", landing)
        if page:
            exam_from_url = exams(page.group(1))

        if not name or not primary:
            rejects.append({
                "Sheet": "Google Ads", "Row": index, "Name": clean_text(r.get("Name")),
                "Phone as written": clean_text(r.get("Student Contact Number ")),
                "Email": clean_text(r.get("Email")),
                "Why it cannot be imported": "No name" if not name else "No usable phone number",
                "Everything else on the row": note_block([("Campaign", campaign), ("Status", r.get("Status"))]),
            })
            continue

        row = blank_row()
        city, district, state = place(r.get("District"))
        row.update({
            "Student Name": name,
            "Primary Phone": primary,
            "Alternate Phone": alternate or "",
            "Email": clean_email(r.get("Email")),
            "City": city, "District": district, "State": state,
            "Interested Exams": exam_from_url,
            "Lead Source": "Google",
            "Sub-source": f"Google Ads — {campaign}" if campaign else "Google Ads",
            "Temperature": temperature_from_status(r.get("Status")),
            "Centre": CENTRE,
            "Notes": note_block([
                ("", f"Imported from the Google Ads sheet, row {index}."),
                ("Enquiry date", (clean_text(r.get("Date")) or "")[:10]),
                ("Status in the sheet", r.get("Status")),
                ("Conversation", r.get("Comments: location, grade, school, student/parent, weekend/regular/synopsis")),
                ("Message on the form", r.get("Message")),
                ("Remarks", r.get("Remarks")),
                ("Landing page", landing[:180]),
            ]),
        })
        out.append(row)
    return out


# --------------------------------------------------------------------------
# Sheet 3 — Meta Lead Ads
# --------------------------------------------------------------------------

META_EXAM = {"nift": "NIFT UG", "nid": "NID", "uceed": "UCEED", "jee2": "JEE Paper 2", "nata": "NATA", "ceed": "CEED"}

def meta_sheet(rows, rejects, excluded):
    out = []
    for index, r in enumerate(rows, start=2):
        name = clean_name(r.get("first_name"))
        raw_exam = clean_text(r.get("which_exam_are_you_interested_in?"))
        if "test lead" in raw_exam.lower() or "dummy data" in raw_exam.lower():
            excluded.append({"Sheet": "Meta Lead Ads", "Row": index, "Name": name,
                             "Why it was left out": "Meta test lead (placeholder answers)"})
            continue

        primary, alternate = split_phones(r.get("phone_number"))
        if not name or not primary:
            rejects.append({
                "Sheet": "Meta Lead Ads", "Row": index, "Name": clean_text(r.get("first_name")),
                "Phone as written": clean_text(r.get("phone_number")), "Email": clean_text(r.get("email")),
                "Why it cannot be imported": "No name" if not name else "No usable phone number",
                "Everything else on the row": note_block([("Form", r.get("form_name")), ("Campaign", r.get("campaign_name"))]),
            })
            continue

        row = blank_row()
        city, district, state = place(r.get("city"))
        # Meta's city question is free text, and people answer it with their
        # own name often enough to matter — "Niranjan Kumar" is not a place.
        # Anything sharing a word with the lead's name is dropped rather
        # than filed as where they live.
        name_words = {w for w in name.lower().split() if len(w) > 2}
        if city and name_words & {w for w in city.lower().split() if len(w) > 2}:
            city, district, state = "", "", ""
        qualification = clean_text(r.get("what_is_your_current_qualification?"))
        organic = clean_text(r.get("is_organic")).lower() == "true"
        row.update({
            "Student Name": name,
            "Primary Phone": primary,
            "Alternate Phone": alternate or "",
            "Email": clean_email(r.get("email")),
            "City": city, "District": district, "State": state,
            "Education Status": education_status(qualification),
            "Interested Exams": META_EXAM.get(raw_exam.lower(), exams(raw_exam)),
            "Lead Source": "Meta",
            "Sub-source": clean_text(r.get("campaign_name")) or ("Organic Meta form" if organic else "Meta lead form"),
            "Centre": CENTRE,
            "Notes": note_block([
                ("", f"Imported from the Meta Lead Ads export, row {index}."),
                ("Submitted", (clean_text(r.get("created_time")) or "")[:10]),
                ("Form", r.get("form_name")),
                ("Ad", r.get("ad_name")),
                ("Ad set", r.get("adset_name")),
                ("Placement", r.get("platform")),
                ("Organic", "yes" if organic else ""),
                ("Qualification as answered", qualification),
                ("City as answered", r.get("city")),
                ("Status in the export", r.get("lead_status")),
            ]),
        })
        out.append(row)
    return out


# --------------------------------------------------------------------------
# Sheet 4 — website forms
# --------------------------------------------------------------------------

def website_sheet(rows, rejects, excluded):
    out = []
    for index, r in enumerate(rows, start=2):
        event = clean_text(r.get("Event Type"))
        note_field = clean_text(r.get("Note"))
        name = clean_name(r.get("Name"))

        if event.lower() == "error" or "(ping)" in event.lower() or "Test & Save" in note_field:
            excluded.append({"Sheet": "Website forms", "Row": index, "Name": name,
                             "Why it was left out": f"Not a real enquiry — {event or 'error row'}"})
            continue

        primary, alternate = split_phones(r.get("Phone"))
        if not name or not primary:
            rejects.append({
                "Sheet": "Website forms", "Row": index, "Name": clean_text(r.get("Name")),
                "Phone as written": clean_text(r.get("Phone")), "Email": clean_text(r.get("Email")),
                "Why it cannot be imported": "No name" if not name else "No usable phone number",
                "Everything else on the row": note_block([
                    ("Event", event), ("Item", r.get("Item")), ("Message", r.get("Message")),
                    ("Received", r.get("Received At")),
                ]),
            })
            continue

        purchase = "course purchased" in event.lower()
        item = clean_text(r.get("Item"))
        row = blank_row()
        row.update({
            "Student Name": name,
            "Primary Phone": primary,
            "Alternate Phone": alternate or "",
            "Email": clean_email(r.get("Email")),
            "Interested Exams": exams(item),
            # Confirmed with the client: a purchase is a Knorish lead; every
            # other website event is a Website lead.
            "Lead Source": "Knorish" if purchase else "Website",
            "Sub-source": (f"Course purchased — {item}" if purchase and item else event) or "Website form",
            "Centre": CENTRE,
            "Notes": note_block([
                ("", f"Imported from the website forms sheet, row {index}."),
                ("Event", event),
                ("Received", clean_text(r.get("Received At"))),
                ("Item", item),
                ("Amount", f"{clean_text(r.get('Amount'))} {clean_text(r.get('Currency'))}".strip()),
                ("Order", clean_text(r.get("Order ID"))),
                ("Payment", clean_text(r.get("Payment ID"))),
                ("Coupon", clean_text(r.get("Coupon"))),
                ("Message", r.get("Message")),
                ("Comments", r.get("Comments")),
            ]),
        })
        out.append(row)
    return out


# --------------------------------------------------------------------------

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    source_folder, out_folder = sys.argv[1], sys.argv[2]
    os.makedirs(out_folder, exist_ok=True)

    files = os.listdir(source_folder)
    def find(fragment):
        for name in files:
            if fragment.lower() in name.lower():
                return name
        sys.exit(f"No sheet matching {fragment!r} in {source_folder}")

    rejects, excluded = [], []
    sheets = [
        ("afd-import-1-main-enquiry-sheet.csv", main_sheet(read_sheet(source_folder, find("main_enquiry")), rejects)),
        ("afd-import-2-google-ads.csv", google_sheet(read_sheet(source_folder, find("Google_Ads")), rejects)),
        ("afd-import-3-meta-lead-ads.csv", meta_sheet(read_sheet(source_folder, find("Meta_Leads")), rejects, excluded)),
        ("afd-import-4-website-forms.csv", website_sheet(read_sheet(source_folder, find("Website_Forms")), rejects, excluded)),
    ]

    print("Import files (open with the CRM's Leads → Import):")
    total = 0
    for name, rows in sheets:
        write_csv(os.path.join(out_folder, name), rows)
        total += len(rows)

    print("\nReview files (not for import):")
    write_csv(os.path.join(out_folder, "afd-review-no-phone-number.csv"), rejects,
              ["Sheet", "Row", "Name", "Phone as written", "Email", "Why it cannot be imported",
               "Everything else on the row"])
    write_csv(os.path.join(out_folder, "afd-review-left-out.csv"), excluded,
              ["Sheet", "Row", "Name", "Why it was left out"])

    print(f"\n{total} leads ready to import, {len(rejects)} need a phone number, {len(excluded)} left out.")

    for kind, counter in unmapped.items():
        if counter:
            print(f"\nUnmapped {kind} values ({sum(counter.values())} cells, {len(counter)} distinct):")
            for value, n in counter.most_common(25):
                print(f"  {n:4}  {value[:70]!r}")


main()
