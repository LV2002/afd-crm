export interface StudentDetailRow {
  id: string;
  student_code: string;
  full_name: string;
  phone: string;
  parent_phone: string | null;
  email: string | null;
  dob: string | null;
  status: string;
  joined_at: string;
  target_exams: string[] | null;
  target_exam_year: string | null;
  current_course: string | null;
  centers: { name: string } | null;
  batches: { name: string } | null;
}
