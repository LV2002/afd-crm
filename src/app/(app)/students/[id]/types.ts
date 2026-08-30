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
  current_batch_id: string | null;
  center_id: string;
  /** field_definitions(entity='student', is_core=false) values — see students/[id]/actions.ts. */
  custom: Record<string, unknown> | null;
  centers: { name: string } | null;
  batches: { name: string } | null;
}
