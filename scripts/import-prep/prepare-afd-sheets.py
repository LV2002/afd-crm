#!/usr/bin/env python3
"""
Turns AFD India's four historic lead sheets into the CRM's import format.

    python3 scripts/import-prep/prepare-afd-sheets.py <folder-of-sheets> <output-folder> \
        [--admissions kochi-workbook.xlsx] [--ad-archive feedback-workbook.xlsx] [--ad-year 2026]

`--admissions` is the Excel original of the main enquiry sheet. A CSV
cannot carry cell colour, and in that sheet green means the enquiry became
an admission — so the colour is read back out of the workbook and those
leads are marked.

`--ad-archive` is the lead feedback workbook, which holds a Google Ads
sheet and a Meta sheet for every month rather than the single month the
CSV exports carry. Given it, the Google and Meta files are built from the
workbook for `--ad-year` (2026 by default) instead of from the CSVs.

Both need `pip install openpyxl`; without them everything else still runs.

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

# What the enquiry register's cell colours mean, phone number by phone
# number. Colour is formatting rather than data, so a CSV export drops it
# — and in that sheet it carries the outcome of the whole conversation.
# Filled by `load_colours()` when the workbook is passed in.
MARKED = {}

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
    (r"nid\s*(m ?des|pg|mdes)", "NID PG"),
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
    # Six leads across two years, so no source option of their own — the
    # wording survives in the sub-source either way.
    if "brochure" in v or "broshure" in v or "brichure" in v or "brochur" in v:
        return "Other", original
    if "event" in v or "expo" in v or "fair" in v or "mariett" in v:
        return "Other", original
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


def cell_text(value):
    """A cell as the string a person would have typed.

    Excel stores a phone number typed as digits as a float, so openpyxl
    hands back 9847012345.0 — and stripping non-digits from that leaves a
    trailing zero that normalises to nothing and matches nobody. This is
    the single place that is undone.
    """
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def sheet_rows(worksheet, header_row=1):
    """Rows of a worksheet as dicts, keyed by the stripped header."""
    rows = list(worksheet.iter_rows(values_only=True))
    if len(rows) <= header_row:
        return []
    headers = [cell_text(c) for c in rows[header_row - 1]]
    out = []
    for offset, values in enumerate(rows[header_row:], start=header_row + 1):
        if not any(v not in (None, "") for v in values):
            continue
        row = {headers[i] if i < len(headers) and headers[i] else f"col{i}": cell_text(v)
               for i, v in enumerate(values)}
        # Its real row number in that worksheet. Without this a note says
        # "row 253" of a sheet with 24 rows, because the rows of twelve
        # months are read into one list.
        row["__row"] = str(offset)
        out.append(row)
    return out


# Confirmed with the client, colour by colour. Four greys rather than the
# three they named: the sheet has one more shade than anybody remembers
# applying, and all four mean the same thing.
COLOURS = {
    "FF00FF00": "admitted",
    "FFFF9900": "competitor",
    "FF999999": "negative",
    "FFB7B7B7": "negative",
    "FFCCCCCC": "negative",
    "FFD9D9D9": "negative",
    "FF00FFFF": "very hot",
    "FFFF0000": "hot",
    "FFFFFF00": "warm",
}

# A row can carry more than one colour, so one has to win. An outcome
# beats a temperature: somebody who joined a competitor in March was warm
# in February, and the February colour is not news. `admitted` is first
# because it is the only one of these the client checked by hand.
PRIORITY = ["admitted", "competitor", "negative", "very hot", "hot", "warm"]

# What each meaning does to the lead.
TEMPERATURE_FOR = {
    "admitted": "Dead",
    "competitor": "Dead",
    "negative": "Dead",
    "very hot": "Hot",
    "hot": "Hot",
    "warm": "Warm",
}

NOTE_FOR = {
    "admitted": "ADMITTED — this enquiry became an admission (marked green in the Kochi workbook). "
                "Imported as history, not as an open lead.",
    "competitor": "JOINED A COMPETITOR — marked orange in the Kochi workbook.",
    "negative": "Marked negative or wrong target in the Kochi workbook.",
    "very hot": "Marked very hot in the Kochi workbook — the sheet's own top grade, above Hot.",
    "hot": "Marked hot in the Kochi workbook.",
    "warm": "Marked warm in the Kochi workbook.",
}


def load_colours(path, sheet="follow up"):
    """Reads the green rows out of the Excel workbook.

    openpyxl is imported here rather than at the top so the script still
    runs without it when no workbook is given — the CSV path needs nothing
    installed, and that is the path somebody will run in a hurry.
    """
    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=True)
    worksheet = workbook[sheet]
    headers = [str(c.value).strip() if c.value is not None else "" for c in next(worksheet.iter_rows(min_row=1, max_row=1))]
    phone_at = headers.index("phone")

    marked, stranded, unknown = {}, [], Counter()
    for row in worksheet.iter_rows(min_row=2):
        if not any(c.value not in (None, "") for c in row):
            continue

        meanings = set()
        for cell in row:
            fill = cell.fill
            if not (fill and fill.patternType and fill.fgColor is not None and fill.fgColor.type == "rgb"):
                continue
            rgb = fill.fgColor.rgb
            if rgb in COLOURS:
                meanings.add(COLOURS[rgb])
            elif rgb not in ("FFFFFFFF", "00000000", None):
                unknown[rgb] += 1
        if not meanings:
            continue
        meaning = min(meanings, key=PRIORITY.index)
        # Excel hands back a phone typed as a number as 9847012345.0, and
        # stripping non-digits from that leaves a trailing zero that
        # matches nobody. Drop the float tail first.
        raw = str(row[phone_at].value or "").strip()
        if raw.endswith(".0"):
            raw = raw[:-2]
        normalised = normalise_phone(raw)
        if normalised:
            # First colour wins when two rows share a number: the sheet is
            # in date order, so that is the earlier conversation, and the
            # later one is the row that is still open.
            marked.setdefault(normalised, meaning)
            continue

        if meaning != "admitted":
            continue

        # A green row with no usable number is an admission the CRM cannot
        # be told about — the one kind of lost row worth chasing, since
        # these are students who actually joined. Collected by name so
        # somebody can look them up.
        cells = {headers[i]: c.value for i, c in enumerate(row) if i < len(headers)}
        stranded.append({
            "Name": clean_name(str(cells.get("Name") or "")),
            "Phone as written": raw,
            "Email": clean_text(str(cells.get("email") or "")),
            "Course": clean_text(str(cells.get("COURSE") or "")),
            "Exam": clean_text(str(cells.get("EXAM") or "")),
            "Place": clean_text(str(cells.get("Place") or "")),
            "Conversation": clean_text(str(cells.get("Conversation Details") or ""))[:300],
        })

    report["admissions_marked_green"] = sum(1 for m in marked.values() if m == "admitted")
    report["admissions_green_without_a_phone"] = len(stranded)
    for meaning in PRIORITY:
        report[f"marked_{meaning.replace(' ', '_')}"] = sum(1 for m in marked.values() if m == meaning)
    if unknown:
        print("Colours in the sheet that nobody has explained, left alone:")
        for rgb, n in unknown.most_common(8):
            print(f"  #{rgb[2:]}  on {n} cells")
        print()
    return marked, stranded


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
        marked = MARKED.get(primary)
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
            # Orange means they joined a competitor, which is what this
            # field asks — so it is true even where the sheet never named
            # the institute.
            "Competitor Student?": "yes" if competitor or marked == "competitor" else "",
            "Competitor Institute": competitor,
            "Interested Exams": exams(r.get("EXAM")),
            "Exam Year": exam_year if re.fullmatch(r"20\d\d", exam_year) else "",
            "Courses Interested": courses(r.get("COURSE")),
            "Lead Source": source,
            # The marker goes in Sub-source because it is the only field in
            # the import format that is free text and filterable. An
            # imported lead always enters at the New stage, so the CRM has
            # no way to say "this one converted" — this, and the first line
            # of the note, are how somebody finds them afterwards.
            "Sub-source": f"{sub_source} — ADMITTED" if marked == "admitted" else sub_source,
            # The colour wins over the status column: it is the mark
            # somebody applied deliberately, and the status text is often
            # a note to themselves from an earlier call.
            "Temperature": TEMPERATURE_FOR.get(marked) or temperature_from_status(status),
            "Centre": CENTRE,
            "Notes": note_block([
                ("", NOTE_FOR.get(marked, "")),
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
# The feedback workbook: two years of monthly ad sheets
# --------------------------------------------------------------------------

MONTHS = ("JANUARY FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST SEPTEMBER OCTOBER "
          "NOVEMBER DECEMBER").split()


def ad_sheets(path, year, kind):
    """The monthly lead sheets for one year, newest last.

    The workbook also holds `Google Leads Status …` sheets, which are
    reports — spend, cost per lead, counts by status — not leads, and
    `GAds JULY 2026-Calls`, which is call volumes. Both are excluded by
    name: a sheet is a lead sheet only if its title is "<kind> <month>
    <year>".
    """
    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    wanted = []
    for title in workbook.sheetnames:
        name = title.strip().upper()
        if not name.startswith(kind.upper()):
            continue
        if str(year) not in name:
            continue
        if not any(month in name for month in MONTHS):
            continue
        if "CALL" in name or "STATUS" in name or "REPORT" in name:
            continue
        wanted.append(title)

    rows = []
    for title in wanted:
        for row in sheet_rows(workbook[title]):
            row["__sheet"] = title
            rows.append(row)
    return wanted, rows


def meta_archive(path, year):
    """The Meta rows, from the two sheets that hold them.

    `Meta New` is an ordinary export. `META 2026` is the same export with
    a year of months stacked into it by hand — a stray header part-way
    down, month-name separator rows, and a test lead at the top — so it
    is read positionally against the export's own column order and
    anything without a date, a name and a phone is dropped.
    """
    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    columns = ["id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
               "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
               "platform", "which_exam_are_you_interested_in?",
               "what_is_your_current_qualification?", "first_name", "email",
               "phone_number", "city", "lead_status"]

    rows = []
    for title in workbook.sheetnames:
        upper = title.strip().upper()
        if upper not in ("META NEW", f"META {year}"):
            continue
        for offset, values in enumerate(workbook[title].iter_rows(values_only=True), start=1):
            row = {columns[i]: cell_text(v) for i, v in enumerate(values) if i < len(columns)}
            row["__row"] = str(offset)
            created = row.get("created_time", "")
            if not created.startswith(str(year)):
                continue
            if not row.get("first_name") or not row.get("phone_number"):
                continue
            row["__sheet"] = title
            rows.append(row)
    return rows


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
        elif landing and not landing.startswith("http"):
            # The monthly sheets name the campaign ("NIFT", "UCEED-CEED")
            # where the September export pastes the landing-page URL.
            campaign = landing
        exam_from_url = ""
        page = re.search(r"campaign\.afdindia\.com/(\w+)", landing)
        if page:
            exam_from_url = exams(page.group(1))
        elif campaign:
            exam_from_url = exams(campaign)

        if not name or not primary:
            rejects.append({
                "Sheet": clean_text(r.get("__sheet")) or "Google Ads", "Row": index,
                "Name": clean_text(r.get("Name")),
                "Phone as written": clean_text(r.get("Student Contact Number ")) or clean_text(r.get("Student Contact Number")),
                "Email": clean_text(r.get("Email")),
                "Why it cannot be imported": "No name" if not name else "No usable phone number",
                "Everything else on the row": note_block([
                    ("Sheet", r.get("__sheet")), ("Campaign", campaign), ("Status", r.get("Status")),
                    ("Conversation", r.get("Comments: location, grade, school, student/parent, weekend/regular/synopsis")),
                ]),
            })
            continue

        row = blank_row()
        city, district, state = place(r.get("District"))
        sheet = clean_text(r.get("__sheet")) or "the Google Ads sheet"
        # The monthly sheets' first column is the date and is sometimes
        # unheaded, which `sheet_rows` names col0.
        when = clean_text(r.get("Date")) or clean_text(r.get("col0"))
        row.update({
            "Student Name": name,
            "Primary Phone": primary,
            "Alternate Phone": alternate or "",
            "Email": clean_email(r.get("Email")),
            "City": city, "District": district, "State": state,
            "Interested Exams": exam_from_url,
            "Courses Interested": courses(r.get("action")),
            "Lead Source": "Google",
            "Sub-source": f"Google Ads — {campaign}" if campaign else "Google Ads",
            "Temperature": temperature_from_status(r.get("Status")) or temperature_from_status(r.get("follow up")),
            "Centre": CENTRE,
            "Notes": note_block([
                ("", f"Imported from {sheet}, row {clean_text(r.get('__row')) or index}."),
                ("Enquiry date", when[:10]),
                ("Campaign type", r.get("Campaign Type")),
                ("Follow-up column", r.get("follow up")),
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
                ("", f"Imported from {clean_text(r.get('__sheet')) or 'the Meta Lead Ads export'}, row {clean_text(r.get('__row')) or index}."),
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

def parse_args(argv):
    """Two positional paths plus a few long flags. argparse would do, but
    this script's whole promise is that it reads top to bottom."""
    positional, flags = [], {}
    i = 1
    while i < len(argv):
        if argv[i].startswith("--"):
            if i + 1 >= len(argv):
                sys.exit(f"{argv[i]} needs a value")
            flags[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            positional.append(argv[i])
            i += 1
    if len(positional) != 2 or set(flags) - {"admissions", "ad-archive", "ad-year"}:
        sys.exit(__doc__)
    return positional[0], positional[1], flags


def main():
    source_folder, out_folder, flags = parse_args(sys.argv)
    os.makedirs(out_folder, exist_ok=True)

    stranded_admissions = []
    if "admissions" in flags:
        marked, stranded_admissions = load_colours(flags["admissions"])
        MARKED.update(marked)
        print("Colour marks read from the workbook:")
        for meaning in PRIORITY:
            n = sum(1 for m in MARKED.values() if m == meaning)
            if n:
                print(f"  {meaning:12} {n:5} enquiries -> {TEMPERATURE_FOR[meaning]}")
        print()

    files = os.listdir(source_folder)
    def find(fragment):
        for name in files:
            if fragment.lower() in name.lower():
                return name
        sys.exit(f"No sheet matching {fragment!r} in {source_folder}")

    rejects, excluded = [], []

    # The September Google Ads export and the recent Meta export are each a
    # single month of what the feedback workbook holds a year of, so when
    # that workbook is given it replaces them rather than adding to them.
    if "ad-archive" in flags:
        year = int(flags.get("ad-year", 2026))
        titles, google_rows = ad_sheets(flags["ad-archive"], year, "GAds")
        meta_rows = meta_archive(flags["ad-archive"], year)
        print(f"Ad archive {year}: {len(google_rows)} Google rows from {len(titles)} monthly sheets, "
              f"{len(meta_rows)} Meta rows.\n")
    else:
        google_rows = read_sheet(source_folder, find("Google_Ads"))
        meta_rows = read_sheet(source_folder, find("Meta_Leads"))

    sheets = [
        ("afd-import-1-main-enquiry-sheet.csv", main_sheet(read_sheet(source_folder, find("main_enquiry")), rejects)),
        ("afd-import-2-google-ads.csv", google_sheet(google_rows, rejects)),
        ("afd-import-3-meta-lead-ads.csv", meta_sheet(meta_rows, rejects, excluded)),
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
    if stranded_admissions:
        write_csv(os.path.join(out_folder, "afd-review-admissions-without-a-phone.csv"), stranded_admissions,
                  ["Name", "Phone as written", "Email", "Course", "Exam", "Place", "Conversation"])

    print(f"\n{total} leads ready to import, {len(rejects)} need a phone number, {len(excluded)} left out.")

    for kind, counter in unmapped.items():
        if counter:
            print(f"\nUnmapped {kind} values ({sum(counter.values())} cells, {len(counter)} distinct):")
            for value, n in counter.most_common(25):
                print(f"  {n:4}  {value[:70]!r}")


main()
