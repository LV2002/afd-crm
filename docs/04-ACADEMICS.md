# Academics — curriculum, timetable, delivery, performance

The academics module, in five layers. Layer 1 is built; the rest are designed here
so that layer 1's shape is not a guess.

Read `CLAUDE.md` first. The non-negotiables apply here unchanged — nothing is hard
deleted, every mutation is audited, authorization is RLS, configuration is data.

---

## Why this exists

One person spends two to three days building one week's timetable. The reason is
not that timetabling is hard; it is that the three things you need to do it live in
three places and none of them is reliable:

- **What is to be taught** lives in the academic coordinator's head and a Google
  Sheet only she can read.
- **When each batch meets** lives in a different sheet.
- **What has actually been taught so far** lives in a third sheet, which faculty
  are supposed to update and mostly do not.

The third is the one that breaks everything. You cannot schedule next week until
you know what happened last week, so a missing update stalls the whole process, and
the coordinator ends up reconstructing it by asking people.

So the order of the layers below is not arbitrary. Each one is the input to the
next, and the delivery log (layer 3) is the one with teeth.

---

## Layer 1 — Curriculum · **BUILT** (migration 0071)

Three tables and one idea: *the syllabus is shared, the depth is not.*

```
syllabus_modules      name, subject, order            -- "Drawing Fundamentals"
  syllabus_topics     name, order                     -- "Two-point perspective"

course_curricula      course, academic_year, teaching_end_date
  curriculum_items    module, topic?, kind, hours, coverage, order
```

`curriculum_items` is the join, and the interesting column is **`coverage`**: free
text saying what specifically is taught, *for this course*. The same topic is four
hours in Foundation and one in Crash, and the difference between those two classes
is the coordinator's actual expertise. It has never been written down anywhere.

`kind` is one of `teaching`, `practice`, `mock_test`, `revision` — one row per
scheduled block rather than three hour-columns on a topic row, because the four
kinds schedule differently and the generator places *blocks*.

`topic_id` is nullable: a mock test belongs to a module, not to a topic inside it.

### Batch timings

```
batch_sessions        batch, day_of_week, start_time, end_time, day_session
```

The recurring weekly pattern — "Saturdays 10:00–13:00, morning". Not the calendar.
`day_session` is `morning` or `evening` because that is how attendance is marked,
and it is a property of the slot rather than something derived from the clock at
read time.

### Pacing

`lib/curriculum/pacing.ts` multiplies the two together: planned hours against hours
the calendar actually contains before the teaching deadline, holidays removed. It
answers "does Foundation still finish by 15 November, and if not, how many extra
hours a week". Pure, unit-tested, no database.

---

## Layer 1b — Faculty · **BUILT** (migration 0072)

```
faculty                 name, phone, email, profile_id?, employment_type,
                        availability_mode(always|by_window)
  faculty_centers       which centres they work at
  faculty_subjects      which subjects they can take
  faculty_availability  recurring windows they ARE free (by_window only)
  faculty_leave         one-off absence, inclusive of both dates
```

Three decisions worth keeping:

**A faculty member is a record, not a login.** `profile_id` is nullable. Visiting
faculty come for one module and never sign in; requiring an auth account before a
name could be written down is exactly the friction that keeps this in a
spreadsheet. Link a login later, if and when they need one.

**Availability is opt-in.** `always` is the default — assumed free, stopped only by
a clash or leave. A whitelist is more precise and nobody fills it in, so the precise
mode exists (`by_window`) and is not compulsory. AFD staffs late; a model that
demands everyone's free hours before it will schedule anything gets bypassed.

**Subjects, not modules.** A module list goes stale every time the syllabus is
edited. "Athira teaches Drawing" stays true longer and is how the institute talks.
`faculty_subjects.subject` matches `syllabus_modules.subject`, so the scheduler goes
block → module → subject → the people who can take it.

Faculty are **data, not configuration** — real people at this institute — so unlike
the syllabus they are deliberately NOT in the config export bundle.

`lib/faculty/availability.ts` answers "who can take Saturday 10–13?" and reports
*every* blocker rather than the first: "busy" sends you looking for another slot,
"busy and does not teach Drawing" tells you to stop considering that person.
Ranking puts the available first, then fewest existing bookings, so load spreads
instead of landing on whoever is alphabetically first.

A seventh role, `faculty`, ships with it. Six roles existed and none of them was a
teacher.

---

## Layer 2 — Timetable generation · designed, not built

Generated **weekly, on Saturday**, for the week ahead.

This is not a constraint solver, and should not become one. Because each batch's
slots are already fixed by `batch_sessions`, the problem reduces to: *expand the
pattern into dates, then walk the plan in order and fill each slot with the next
unfinished block.* That is a loop, not a search.

```
timetable_weeks       batch, week_start, status(draft|published|locked), generated_at
  timetable_slots     date, start/end, curriculum_item, faculty, room?,
                      status(planned|taught|partial|cancelled), sequence
```

The generator:

1. Expand `batch_sessions` across the week, skipping holidays.
2. Take the plan's blocks in `sort_order`, skipping anything already delivered
   (layer 3) and anything a slot is already holding.
3. Place blocks into slots until the hours run out. A block longer than one slot
   spans into the next; a slot with hours left takes the next block.
4. Assign faculty **(needs input — see the open questions)**.
5. Publish as a draft the coordinator can drag around before locking.

A generated week is a **draft**, always. A generator that publishes straight to
faculty is one that has to be perfect, and this one will not be in week one.

---

## Layer 3 — Delivery log · designed, not built

The part with teeth, and the reason the rest works.

```
class_records         timetable_slot, date, batch, faculty,
                      status(taught|partial|not_taught),
                      covered_note, pending_note, recorded_by, recorded_at
```

Rules:

- A slot that has passed and has no `class_record` is **overdue**. The coordinator
  sees it on her dashboard the same evening.
- Overdue past a threshold notifies the admin. This is the "if not, the admin gets
  a notification" Leon asked for, and it is an ordinary `notification_events` key
  so the threshold and the recipients stay configurable.
- **`not_taught` requires admin approval.** Marking a class as not taken releases
  its blocks back into the pool for next week's generation, which changes the
  timetable — so it is an approval, not a checkbox. `partial` carries the remaining
  hours, and only the remainder comes back.
- Generation for week N+1 **reads** the log for week N. No log, no schedule: this
  is the forcing function, and it should be visible as one rather than hidden.

The existing `tasks` table cannot be reused — it is `lead_id NOT NULL`, tied to the
sales object. Academic work needs its own.

---

## Layer 4 — Homework, mock tests, attendance · designed, not built

```
assignments           batch, module?, topic?, kind(homework|mock_test),
                      title, assigned_on, due_on, is_optional, max_marks
  submissions         assignment, student, submitted_on, marks, graded_by,
                      graded_at, feedback
attendance            batch, student, date, day_session, status
```

- **Optional homework** is a flag on the assignment, and optional work is excluded
  from the "submitted X of Y" denominator.
- **Grading SLA:** marks due within 14 days of submission. Same shape as the lead
  SLA sweep — a sweep finds ungraded submissions past the target and puts them on
  the faculty member's dashboard.
- **Attendance** is per `day_session`, matching the existing morning/evening sheet.
- **Everything is measured from the student's join date**, never before it. A
  student joining in October is not marked absent for September, and their
  submission ratio counts only work assigned after they arrived. This is Leon's
  explicit instruction and it belongs in the query, not in a later correction.

The grading screen is a roster grid: students down, assignments across, one cell
per pair. Plus a "next student" flow for entering feedback, because a grid is good
for seeing and bad for typing.

---

## Layer 5 — Report cards and performance · designed, not built

```
report_cards          student, period_start, period_end, generated_at,
                      metrics jsonb, faculty_feedback, approved_by, approved_at, sent_at
```

Generated **every two months on a fixed date**, carrying attendance percentage,
mock test scores by module, homework submitted out of assigned (optional excluded),
and a trend against the previous card.

A generated card is **not sent**. It waits for faculty feedback, then for approval,
then goes to parents. Three states, because a report card with an empty feedback box
going to a parent is worse than one sent a week late.

`metrics` is a jsonb snapshot, deliberately. A report card is a statement about a
moment; recomputing it in 2028 from live tables would produce a different document
with the same date on it.

---

## Integration with the rest of the CRM

**Batch assignment at Gate 1.** `enrolments.batch_id` exists and nothing sets it —
the confirm-admission form never asks. Leon's requirement that "all students should
get added to a batch by the sales team when they enrolled" means adding the batch
picker to that form, and it is the join that makes everything above reachable from
a lead. This is a small change and a blocking one.

**Faculty as a role.** Shipped in 0072. Faculty→batch assignment is still per-slot
rather than per-batch — the generator picks a person for each block from the
available set, which suits an institute where a module's teacher changes.

**Future LMS.** Everything above is designed to survive students logging in:
`submissions` already has a date and a grader, so a digital submission is the same
row with a file attached; `curriculum_items` already carry coverage, so dripping
content is a release date on an existing row. No layer assumes the work arrives on
paper.

---

## Open questions

These are genuinely unresolved and each one changes what gets built.

1. ~~**Faculty availability and clashes.**~~ Resolved by building it rather than
   asking: Leon's staff change constantly, so the answer was a screen, not a list.
   See Layer 1b.
2. **Rooms.** Not mentioned. If two batches can collide over a room, the generator
   needs to know.
3. **Subject variety within a week.** Should the generator interleave subjects, or
   run one module to completion? `syllabus_modules.subject` exists so it *can*
   interleave; whether it should is a teaching judgement.
4. **Mock test scheduling.** In-slot or separate? Same day across all batches, or
   per batch?
5. **Late joiners.** A student joining in week six — catch-up material, or straight
   into the current week?
6. **Marks scale.** Per-assignment max marks, or a fixed scale? Any grade bands?
7. **Parent contact.** Report cards go to parents, but `students` has
   `parent_phone` and no parent email. WhatsApp or email?
8. **Report card date.** "A fixed date every two months" — which date?

---

## Decisions already taken

- **The plan attaches to a course, not a batch.** Two batches of the same course in
  different centres share a plan. If a real per-batch deviation appears, it is one
  nullable `batch_id` on `curriculum_items` and no restructuring — which is why the
  table is shaped this way rather than keyed on the batch.
- **Hours, not periods.** A period assumes every slot is the same length. AFD's are
  not.
- **`numeric(5,2)`, not float.** 1.75 hours must stay 1.75, for the same reason
  money is stored in paise.
- **The syllabus is configuration, not data.** It is in the config export bundle
  (version 5). Another institute deploying this replaces these rows and has a
  working CRM, which is CLAUDE.md's own plug-and-play test.
- **The delivery log gates generation.** Not a nag, a dependency. Making it optional
  would recreate exactly the failure that makes timetabling take three days today.
