/**
 * Does an admission match what somebody typed into the search box?
 *
 * Words are all required (each may match anywhere), so "asha kochi" finds
 * Asha at Kochi. Text matches the student's name, course, centre and academic
 * year; a run of digits matches inside the phone number, in any format.
 */
export interface SearchableAdmission {
  studentName: string | null;
  phone: string | null;
  course: string;
  centreName: string | null;
  academicYear: string;
}

export function admissionMatches(row: SearchableAdmission, query: string): boolean {
  // A pasted "+91 98470 12345" has a country code that is not part of the number as stored.
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "" && !/^\+91$/.test(w));
  if (words.length === 0) return true;
  const text = [row.studentName, row.course, row.centreName, row.academicYear].join(" ").toLowerCase();
  const digits = (row.phone ?? "").replace(/\D/g, "");
  return words.every((w) => {
    if (text.includes(w)) return true;
    const wd = w.replace(/\D/g, "");
    // Two digits would match half the phone numbers in the system.
    return wd.length >= 3 && wd === w.replace(/[\s()+-]/g, "") && digits.includes(wd.replace(/^91(?=\d{10}$)/, ""));
  });
}
