-- ============================================================================
-- 02_policies.sql — นโยบาย Row Level Security ของสกีมา public
-- ----------------------------------------------------------------------------
-- ทุกตารางเปิด RLS ไม่มีข้อยกเว้น
-- นโยบายทั้งหมดเรียกใช้ฟังก์ชันตัวช่วยใน 01_helpers.sql
-- สิทธิ์ตัดสินที่นี่ ไม่ใช่ที่หน้าเว็บ — แก้หน้าเว็บแล้วก็ยังผ่านด่านนี้ไม่ได้
--
-- สำเนา ณ 30 ก.ย. 2569 — ดึงใหม่ได้ด้วย 90_export.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ทะเบียนนักศึกษาและผลการเรียน
-- ---------------------------------------------------------------------------
alter table public.student enable row level security;
drop policy if exists p_read on public.student;
drop policy if exists p_insert on public.student;
drop policy if exists p_update on public.student;
drop policy if exists p_delete on public.student;
-- นักศึกษาเห็นของตัวเอง · อาจารย์ที่ปรึกษา/ประจำชั้นเห็นเฉพาะที่ตนดูแล
create policy p_read on public.student for select to authenticated
  using ((ems.sees_all_students() OR (student_id = ems.student_id()) OR ems.owns_student(student_id)));
create policy p_insert on public.student for insert to authenticated with check (ems.is_full());
create policy p_update on public.student for update to authenticated
  using (ems.is_full()) with check (ems.is_full());
create policy p_delete on public.student for delete to authenticated using (ems.is_full());

-- เลขบัตรประชาชน — นิยามอยู่ท้ายไฟล์ ดูหัวข้อ "เลขบัตรประชาชนนักศึกษา"
-- ของเดิมใช้นโยบายเดียวครอบทั้งอ่านและเขียนด้วย is_full() ซึ่งกว้างเกินไป
-- ตอนนี้แยกเป็น อ่าน = ผู้ดูแลระบบ/งานทะเบียน · เขียน = เพิ่มงานวิชาการได้

alter table public.grade enable row level security;
drop policy if exists p_read on public.grade;
drop policy if exists p_insert on public.grade;
drop policy if exists p_update on public.grade;
drop policy if exists p_delete on public.grade;
-- นักศึกษาเห็นเกรดตัวเอง · ผู้รับผิดชอบรายวิชาเห็นของวิชาตน
-- · ที่ปรึกษาเห็นของนักศึกษาในความดูแล · ประจำชั้นเห็นทั้งชั้นปี
create policy p_read on public.grade for select to public
  using ((ems.sees_all_students() OR (student_id = ems.student_id())
    OR (ems.has_role('teacher'::text) AND (subject_code = ANY (ems.my_subject_codes())))
    OR (ems.has_role('teacher'::text) AND (ems.user_name() <> ''::text) AND (EXISTS ( SELECT 1
         FROM student s WHERE ((s.student_id = grade.student_id)
           AND (lower(btrim(s.advisor)) = lower(btrim(ems.user_name())))))))
    OR (ems.has_role('classTeacher'::text) AND (ems.my_year() <> ''::text) AND (EXISTS ( SELECT 1
         FROM student s WHERE ((s.student_id = grade.student_id)
           AND (btrim(COALESCE(s.year_level, ''::text)) = ems.my_year())))))));
create policy p_insert on public.grade for insert to authenticated with check (ems.is_educator());
create policy p_update on public.grade for update to authenticated
  using (ems.is_educator()) with check (ems.is_educator());
create policy p_delete on public.grade for delete to authenticated using (ems.is_educator());

alter table public.eng_result enable row level security;
drop policy if exists p_read on public.eng_result;
drop policy if exists p_insert on public.eng_result;
drop policy if exists p_update on public.eng_result;
drop policy if exists p_delete on public.eng_result;
create policy p_read on public.eng_result for select to public
  using ((ems.sees_all_students() OR (student_id = ems.student_id())
    OR (ems.has_role('teacher'::text) AND (ems.user_name() <> ''::text) AND (EXISTS ( SELECT 1
         FROM student s WHERE ((s.student_id = eng_result.student_id)
           AND (lower(btrim(s.advisor)) = lower(btrim(ems.user_name())))))))
    OR (ems.has_role('classTeacher'::text) AND (ems.my_year() <> ''::text) AND (EXISTS ( SELECT 1
         FROM student s WHERE ((s.student_id = eng_result.student_id)
           AND (btrim(COALESCE(s.year_level, ''::text)) = ems.my_year())))))));
create policy p_insert on public.eng_result for insert to authenticated with check (ems.is_educator());
create policy p_update on public.eng_result for update to authenticated
  using (ems.is_educator()) with check (ems.is_educator());
create policy p_delete on public.eng_result for delete to authenticated using (ems.is_educator());

alter table public.alumni enable row level security;
drop policy if exists p_read on public.alumni;
drop policy if exists p_insert on public.alumni;
drop policy if exists p_update on public.alumni;
drop policy if exists p_delete on public.alumni;
create policy p_read on public.alumni for select to authenticated using (ems.sees_all_students());
create policy p_insert on public.alumni for insert to authenticated with check (ems.is_full());
create policy p_update on public.alumni for update to authenticated
  using (ems.is_full()) with check (ems.is_full());
create policy p_delete on public.alumni for delete to authenticated using (ems.is_full());

-- ---------------------------------------------------------------------------
-- ใบลา และคำร้องขอเอกสาร
-- ---------------------------------------------------------------------------
alter table public.leave enable row level security;
drop policy if exists p_read on public.leave;
drop policy if exists p_insert on public.leave;
drop policy if exists p_update on public.leave;
drop policy if exists p_delete on public.leave;
create policy p_read on public.leave for select to public
  using ((ems.sees_all_students() OR (name = ems.user_name()) OR (student_id = ems.student_id())
    OR ems.owns_student(student_id)
    OR (ems.has_any_role(ARRAY['teacher'::text, 'classTeacher'::text]) AND (EXISTS ( SELECT 1
         FROM student s WHERE ((ems.norm(s.name) = ems.norm(leave.name))
           AND ems.owns_student(s.student_id)))))));
create policy p_insert on public.leave for insert to authenticated with check (true);
create policy p_update on public.leave for update to authenticated
  using (ems.is_staff()) with check (ems.is_staff());
create policy p_delete on public.leave for delete to authenticated using (ems.is_full());

alter table public.doc_request enable row level security;
drop policy if exists p_read on public.doc_request;
drop policy if exists p_insert on public.doc_request;
drop policy if exists p_update on public.doc_request;
create policy p_read on public.doc_request for select to authenticated
  using ((ems.is_staff() OR (student_id = ems.student_id())));
create policy p_insert on public.doc_request for insert to authenticated with check (true);
create policy p_update on public.doc_request for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

-- ---------------------------------------------------------------------------
-- ข้อมูลหลักที่ทุกคนที่ล็อกอินอ่านได้ แต่แก้ได้เฉพาะงานทะเบียน/วิชาการ
-- ---------------------------------------------------------------------------
alter table public.subject enable row level security;
drop policy if exists p_read on public.subject;
drop policy if exists p_write on public.subject;
create policy p_read on public.subject for select to authenticated using (true);
create policy p_write on public.subject for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.schedule enable row level security;
drop policy if exists p_read on public.schedule;
drop policy if exists p_write on public.schedule;
create policy p_read on public.schedule for select to authenticated using (true);
create policy p_write on public.schedule for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.announcement enable row level security;
drop policy if exists p_read on public.announcement;
drop policy if exists p_write on public.announcement;
create policy p_read on public.announcement for select to authenticated using (true);
create policy p_write on public.announcement for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.homeroom enable row level security;
drop policy if exists p_read on public.homeroom;
drop policy if exists p_write on public.homeroom;
create policy p_read on public.homeroom for select to authenticated using (true);
create policy p_write on public.homeroom for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.permission enable row level security;
drop policy if exists p_read on public.permission;
drop policy if exists p_write on public.permission;
create policy p_read on public.permission for select to authenticated using (true);
create policy p_write on public.permission for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.app_setting enable row level security;
drop policy if exists app_setting_read on public.app_setting;
drop policy if exists app_setting_write on public.app_setting;
create policy app_setting_read on public.app_setting for select to authenticated using (true);
create policy app_setting_write on public.app_setting for all to authenticated
  using (ems.has_any_role(ARRAY['admin'::text, 'academic'::text]))
  with check (ems.has_any_role(ARRAY['admin'::text, 'academic'::text]));

-- ---------------------------------------------------------------------------
-- ข้อมูลบุคลากร — นักศึกษาอ่านไม่ได้
-- ---------------------------------------------------------------------------
alter table public.teacher enable row level security;
drop policy if exists p_read on public.teacher;
drop policy if exists p_write on public.teacher;
create policy p_read on public.teacher for select to authenticated using (ems.is_staff());
create policy p_write on public.teacher for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.teacher_directory enable row level security;
drop policy if exists p_read on public.teacher_directory;
drop policy if exists p_write on public.teacher_directory;
create policy p_read on public.teacher_directory for select to authenticated using (ems.is_staff());
create policy p_write on public.teacher_directory for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.directory_summary enable row level security;
drop policy if exists p_read on public.directory_summary;
drop policy if exists p_write on public.directory_summary;
create policy p_read on public.directory_summary for select to authenticated using (ems.is_staff());
create policy p_write on public.directory_summary for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.special_teacher enable row level security;
drop policy if exists p_read on public.special_teacher;
drop policy if exists p_write on public.special_teacher;
create policy p_read on public.special_teacher for select to authenticated using (ems.is_staff());
create policy p_write on public.special_teacher for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.practicum_site enable row level security;
drop policy if exists p_read on public.practicum_site;
drop policy if exists p_write on public.practicum_site;
create policy p_read on public.practicum_site for select to public using (ems.is_staff());
create policy p_write on public.practicum_site for all to public
  using (ems.is_full()) with check (ems.is_full());

-- ---------------------------------------------------------------------------
-- การติดตามการส่งงานรายวิชา
-- ---------------------------------------------------------------------------
alter table public.tracking enable row level security;
drop policy if exists p_read on public.tracking;
drop policy if exists p_write on public.tracking;
create policy p_read on public.tracking for select to authenticated using (ems.is_staff());
create policy p_write on public.tracking for all to authenticated
  using (ems.is_educator()) with check (ems.is_educator());

alter table public.result_tracking enable row level security;
drop policy if exists p_read on public.result_tracking;
drop policy if exists p_write on public.result_tracking;
create policy p_read on public.result_tracking for select to authenticated using (ems.is_staff());
create policy p_write on public.result_tracking for all to authenticated
  using (ems.is_educator()) with check (ems.is_educator());

alter table public.grade_tracking enable row level security;
drop policy if exists p_read on public.grade_tracking;
drop policy if exists p_write on public.grade_tracking;
create policy p_read on public.grade_tracking for select to authenticated using (ems.is_staff());
create policy p_write on public.grade_tracking for all to authenticated
  using (ems.is_educator()) with check (ems.is_educator());

alter table public.file_tracking enable row level security;
drop policy if exists p_read on public.file_tracking;
drop policy if exists p_write on public.file_tracking;
create policy p_read on public.file_tracking for select to authenticated using (ems.is_staff());
create policy p_write on public.file_tracking for all to authenticated
  using (ems.is_educator()) with check (ems.is_educator());

-- ---------------------------------------------------------------------------
-- หลักสูตรและ PLO
-- ---------------------------------------------------------------------------
-- ตารางหลักสูตรสี่ตัวใช้ชุดนโยบายเดียวกัน
alter table public.curriculum enable row level security;
alter table public.curriculum_course enable row level security;
alter table public.curriculum_plo enable row level security;
alter table public.curriculum_map enable row level security;
do $$
declare t text;
begin
  foreach t in array array['curriculum','curriculum_course','curriculum_plo','curriculum_map'] loop
    execute format('drop policy if exists cur_read on public.%I', t);
    execute format('drop policy if exists cur_write on public.%I', t);
    execute format('drop policy if exists cur_update on public.%I', t);
    execute format('drop policy if exists cur_delete on public.%I', t);
    execute format('create policy cur_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy cur_write on public.%I for insert to authenticated
        with check (ems.has_any_role(array[''admin'',''academic'']))', t);
    execute format('create policy cur_update on public.%I for update to authenticated
        using (ems.has_any_role(array[''admin'',''academic'']))
        with check (ems.has_any_role(array[''admin'',''academic'']))', t);
    execute format('create policy cur_delete on public.%I for delete to authenticated
        using (ems.has_any_role(array[''admin'',''academic'']))', t);
  end loop;
end $$;

-- ตาราง PLO สี่ตัวใช้ชุดนโยบายเดียวกัน — นักศึกษาอ่านไม่ได้เลย
alter table public.plo_setting enable row level security;
alter table public.plo_band enable row level security;
alter table public.plo_clo enable row level security;
alter table public.plo_score enable row level security;
do $$
declare t text;
begin
  foreach t in array array['plo_setting','plo_band','plo_clo','plo_score'] loop
    execute format('drop policy if exists plo_read on public.%I', t);
    execute format('drop policy if exists plo_write on public.%I', t);
    execute format('drop policy if exists plo_update on public.%I', t);
    execute format('drop policy if exists plo_delete on public.%I', t);
    execute format('create policy plo_read on public.%I for select to authenticated
        using (ems.has_any_role(array[''admin'',''academic'',''registrar'',''executive'',''teacher'',''classTeacher'',''deptHead'']))', t);
    execute format('create policy plo_write on public.%I for insert to authenticated
        with check (ems.has_any_role(array[''admin'',''academic'',''teacher'',''classTeacher'']))', t);
    execute format('create policy plo_update on public.%I for update to authenticated
        using (ems.has_any_role(array[''admin'',''academic'',''teacher'',''classTeacher'']))
        with check (ems.has_any_role(array[''admin'',''academic'',''teacher'',''classTeacher'']))', t);
    execute format('create policy plo_delete on public.%I for delete to authenticated
        using (ems.has_any_role(array[''admin'',''academic'']))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ระบบประเมินผลรายวิชา
-- ---------------------------------------------------------------------------
-- โครงของแบบประเมิน : ทุกคนที่ล็อกอินอ่านได้ (นักศึกษาต้องอ่านเพื่อตอบ)
-- แก้ได้เฉพาะงานทะเบียน/วิชาการ
alter table public.eval_itemset enable row level security;
drop policy if exists ev_set_read on public.eval_itemset;
drop policy if exists ev_set_write on public.eval_itemset;
create policy ev_set_read on public.eval_itemset for select to authenticated using (true);
create policy ev_set_write on public.eval_itemset for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.eval_item enable row level security;
drop policy if exists ev_item_read on public.eval_item;
drop policy if exists ev_item_write on public.eval_item;
create policy ev_item_read on public.eval_item for select to authenticated using (true);
create policy ev_item_write on public.eval_item for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.eval_form enable row level security;
drop policy if exists ev_form_read on public.eval_form;
drop policy if exists ev_form_write on public.eval_form;
create policy ev_form_read on public.eval_form for select to authenticated using (true);
create policy ev_form_write on public.eval_form for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.eval_target enable row level security;
drop policy if exists ev_tgt_read on public.eval_target;
drop policy if exists ev_tgt_write on public.eval_target;
create policy ev_tgt_read on public.eval_target for select to authenticated using (true);
create policy ev_tgt_write on public.eval_target for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.eval_heading enable row level security;
drop policy if exists ev_head_read on public.eval_heading;
drop policy if exists ev_head_write on public.eval_heading;
create policy ev_head_read on public.eval_heading for select to authenticated using (true);
create policy ev_head_write on public.eval_heading for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

-- กลุ่มย่อยของวิชาปฏิบัติ — ย้ายไปนิยามรวมกับตารางใหม่อื่น ๆ ท้ายไฟล์
-- (ของเดิมเขียน to public ซึ่งต่างจากตารางอื่น จึงแก้ให้เป็น authenticated ทั้งหมด)

-- คำตอบของนักศึกษา : เจ้าตัวแก้ได้จนกว่าจะกด "ส่งแล้ว" หลังจากนั้นแก้ไม่ได้อีก
alter table public.eval_response enable row level security;
drop policy if exists ev_resp_read on public.eval_response;
drop policy if exists ev_resp_insert on public.eval_response;
drop policy if exists ev_resp_update on public.eval_response;
create policy ev_resp_read on public.eval_response for select to authenticated
  using (((student_id = ems.my_student_id()) OR ems.has_any_role(ARRAY['admin'::text])));
create policy ev_resp_insert on public.eval_response for insert to authenticated
  with check ((student_id = ems.my_student_id()));
create policy ev_resp_update on public.eval_response for update to authenticated
  using (((student_id = ems.my_student_id()) AND (COALESCE(status, ''::text) <> 'ส่งแล้ว'::text)))
  with check ((student_id = ems.my_student_id()));

-- คำตอบรายข้อ : อ่านได้เฉพาะงานวิชาการ/ทะเบียน/ผู้บริหาร/ผู้ดูแล และเจ้าของคำตอบ
-- อาจารย์ผู้สอนอ่านตารางนี้ตรง ๆ ไม่ได้ — เห็นผลผ่าน ems_eval_summary() ที่สรุปมาแล้วเท่านั้น
alter table public.eval_answer enable row level security;
drop policy if exists ev_ans_read on public.eval_answer;
drop policy if exists ev_ans_read_own on public.eval_answer;
drop policy if exists ev_ans_insert on public.eval_answer;
drop policy if exists ev_ans_delete on public.eval_answer;
create policy ev_ans_read on public.eval_answer for select to authenticated
  using (ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'registrar'::text, 'executive'::text]));
create policy ev_ans_read_own on public.eval_answer for select to authenticated
  using ((EXISTS ( SELECT 1 FROM eval_response r
    WHERE ((r.response_key = eval_answer.response_key) AND (r.student_id = ems.my_student_id())))));
create policy ev_ans_insert on public.eval_answer for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM eval_response r
    WHERE ((r.response_key = eval_answer.response_key) AND (r.student_id = ems.my_student_id())
      AND (COALESCE(r.status, ''::text) <> 'ส่งแล้ว'::text)))));
create policy ev_ans_delete on public.eval_answer for delete to authenticated
  using ((EXISTS ( SELECT 1 FROM eval_response r
    WHERE ((r.response_key = eval_answer.response_key) AND (r.student_id = ems.my_student_id())
      AND (COALESCE(r.status, ''::text) <> 'ส่งแล้ว'::text)))));

-- ---------------------------------------------------------------------------
-- ภาระงานนักศึกษา
-- ---------------------------------------------------------------------------
alter table public.workload_plan enable row level security;
alter table public.workload_rate enable row level security;
do $$
declare t text;
begin
  foreach t in array array['workload_plan','workload_rate'] loop
    execute format('drop policy if exists wl_read on public.%I', t);
    execute format('drop policy if exists wl_read_student on public.%I', t);
    execute format('drop policy if exists wl_insert on public.%I', t);
    execute format('drop policy if exists wl_update on public.%I', t);
    execute format('drop policy if exists wl_delete on public.%I', t);
    execute format('create policy wl_read on public.%I for select to authenticated
        using (ems.has_any_role(array[''admin'',''academic'',''executive'',''otherStaff'']))', t);
    -- นักศึกษาต้องอ่านแผนและอัตราถ่วงน้ำหนักได้ เพื่อดูภาระงานของตัวเอง
    execute format('create policy wl_read_student on public.%I for select to public
        using (ems.has_any_role(array[''student'']))', t);
    execute format('create policy wl_insert on public.%I for insert to authenticated
        with check (ems.has_any_role(array[''admin'',''academic'',''otherStaff'']))', t);
    execute format('create policy wl_update on public.%I for update to authenticated
        using (ems.has_any_role(array[''admin'',''academic'',''otherStaff'']))
        with check (ems.has_any_role(array[''admin'',''academic'',''otherStaff'']))', t);
    execute format('create policy wl_delete on public.%I for delete to authenticated
        using (ems.has_any_role(array[''admin'',''academic'',''otherStaff'']))', t);
  end loop;
end $$;

-- นักศึกษาบันทึกภาระงานของตัวเองได้ และเห็นเฉพาะของตัวเอง
alter table public.workload_student enable row level security;
drop policy if exists wl_read on public.workload_student;
drop policy if exists wl_read_own on public.workload_student;
drop policy if exists wl_insert on public.workload_student;
drop policy if exists wl_insert_own on public.workload_student;
drop policy if exists wl_update on public.workload_student;
drop policy if exists wl_update_own on public.workload_student;
drop policy if exists wl_delete on public.workload_student;
create policy wl_read on public.workload_student for select to authenticated
  using (ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'executive'::text, 'otherStaff'::text]));
create policy wl_read_own on public.workload_student for select to public
  using (((student_id IS NOT NULL) AND (student_id = ems.my_student_id())));
create policy wl_insert on public.workload_student for insert to authenticated
  with check (ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'otherStaff'::text]));
create policy wl_insert_own on public.workload_student for insert to public
  with check (((student_id IS NOT NULL) AND (student_id = ems.my_student_id())));
create policy wl_update on public.workload_student for update to authenticated
  using (ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'otherStaff'::text]))
  with check (ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'otherStaff'::text]));
create policy wl_update_own on public.workload_student for update to public
  using (((student_id IS NOT NULL) AND (student_id = ems.my_student_id())))
  with check (((student_id IS NOT NULL) AND (student_id = ems.my_student_id())));
create policy wl_delete on public.workload_student for delete to authenticated
  using (ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'otherStaff'::text]));

-- ---------------------------------------------------------------------------
-- แบบประเมินความพึงพอใจต่อระบบ
-- ---------------------------------------------------------------------------
alter table public.survey_config enable row level security;
drop policy if exists p_read on public.survey_config;
drop policy if exists p_write on public.survey_config;
create policy p_read on public.survey_config for select to authenticated using (true);
create policy p_write on public.survey_config for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

alter table public.survey_question enable row level security;
drop policy if exists p_read on public.survey_question;
drop policy if exists p_write on public.survey_question;
create policy p_read on public.survey_question for select to authenticated using (true);
create policy p_write on public.survey_question for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

-- ตอบได้เฉพาะปีที่เปิดรับอยู่ · เห็นคำตอบของตัวเอง หรือของทุกคนถ้าเป็นผู้บริหาร/งานวิชาการ
alter table public.survey_response enable row level security;
drop policy if exists p_read on public.survey_response;
drop policy if exists p_insert on public.survey_response;
drop policy if exists p_admin on public.survey_response;
create policy p_read on public.survey_response for select to public
  using ((ems.has_any_role(ARRAY['admin'::text, 'academic'::text, 'executive'::text, 'deptHead'::text])
    OR (respondent_key = ('STU:'::text || ems.student_id()))
    OR (respondent_name = ems.user_name())));
create policy p_insert on public.survey_response for insert to authenticated
  with check ((EXISTS ( SELECT 1 FROM survey_config c
    WHERE ((c.academic_year = survey_response.academic_year) AND (c.status = 'open'::text)))));
create policy p_admin on public.survey_response for all to public
  using (ems.has_any_role(ARRAY['admin'::text, 'academic'::text]))
  with check (ems.has_any_role(ARRAY['admin'::text, 'academic'::text]));

-- ---------------------------------------------------------------------------
-- บัญชีผู้ใช้ ประวัติการเข้าระบบ และงานระบบ
-- ---------------------------------------------------------------------------
alter table public.app_user enable row level security;
drop policy if exists p_read on public.app_user;
drop policy if exists p_write on public.app_user;
create policy p_read on public.app_user for select to authenticated
  using ((ems.is_full() OR (auth_user_id = auth.uid())));
create policy p_write on public.app_user for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

-- ข้อมูลส่วนตัวที่ผู้ใช้แก้เอง (ชื่อ เบอร์โทร รูป ลายเซ็น)
alter table public.user_profile enable row level security;
drop policy if exists user_profile_select on public.user_profile;
drop policy if exists user_profile_insert on public.user_profile;
drop policy if exists user_profile_update on public.user_profile;
drop policy if exists user_profile_delete on public.user_profile;
create policy user_profile_select on public.user_profile for select to authenticated
  using (((auth_user_id = auth.uid()) OR ems.is_staff()));
create policy user_profile_insert on public.user_profile for insert to authenticated
  with check (((auth_user_id = auth.uid()) OR ems.has_any_role(ARRAY['admin'::text])));
create policy user_profile_update on public.user_profile for update to authenticated
  using (((auth_user_id = auth.uid()) OR ems.has_any_role(ARRAY['admin'::text])))
  with check (((auth_user_id = auth.uid()) OR ems.has_any_role(ARRAY['admin'::text])));
create policy user_profile_delete on public.user_profile for delete to authenticated
  using (((auth_user_id = auth.uid()) OR ems.has_any_role(ARRAY['admin'::text])));

-- บันทึกเหตุการณ์ : เขียนได้ทุกคน อ่านได้เฉพาะผู้ดูแลระบบ
alter table public.login_log enable row level security;
drop policy if exists p_read on public.login_log;
drop policy if exists p_insert on public.login_log;
create policy p_read on public.login_log for select to public using (ems.has_role('admin'::text));
create policy p_insert on public.login_log for insert to authenticated with check (true);

alter table public.password_log enable row level security;
drop policy if exists p_read on public.password_log;
drop policy if exists p_insert on public.password_log;
create policy p_read on public.password_log for select to public using (ems.has_role('admin'::text));
create policy p_insert on public.password_log for insert to authenticated with check (true);

alter table public.mail_log enable row level security;
drop policy if exists p_read on public.mail_log;
create policy p_read on public.mail_log for select to public using (ems.has_role('admin'::text));

alter table public.line_group enable row level security;
drop policy if exists p_read on public.line_group;
drop policy if exists p_write on public.line_group;
create policy p_read on public.line_group for select to authenticated using (ems.is_full());
create policy p_write on public.line_group for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

-- แจ้งปัญหาการใช้งาน : เห็นของตัวเอง ผู้ดูแลเห็นทั้งหมด
alter table public.support_ticket enable row level security;
drop policy if exists p_read on public.support_ticket;
drop policy if exists p_insert on public.support_ticket;
drop policy if exists p_update on public.support_ticket;
drop policy if exists p_delete on public.support_ticket;
create policy p_read on public.support_ticket for select to public
  using ((ems.is_full() OR (auth_uid = auth.uid())));
create policy p_insert on public.support_ticket for insert to public
  with check ((auth_uid = auth.uid()));
create policy p_update on public.support_ticket for update to public
  using (ems.is_full()) with check (ems.is_full());
create policy p_delete on public.support_ticket for delete to public using (ems.is_full());

-- ตารางสำรองจากการแก้รหัสวิชาครั้งหนึ่ง เก็บไว้เป็นหลักฐาน
alter table public._backup_subject_code_fix enable row level security;
drop policy if exists p_admin on public._backup_subject_code_fix;
create policy p_admin on public._backup_subject_code_fix for all to public
  using (ems.has_role('admin'::text)) with check (ems.has_role('admin'::text));

-- ---------------------------------------------------------------------------
-- ⚠️ drive_link — เปิด RLS ไว้แต่ไม่มีนโยบายใดเลย โดยตั้งใจ
-- ---------------------------------------------------------------------------
-- ตารางนี้เก็บ refresh token ของบัญชี Google ที่ใช้เชื่อม Drive
-- ไม่มีนโยบาย = ไม่มีใครอ่านผ่าน API ได้ อ่านได้เฉพาะ Edge Function ที่ใช้ service role
-- ห้ามเพิ่มนโยบายให้ตารางนี้ (เครื่องมือตรวจของ Supabase จะเตือนว่า "ไม่มีนโยบาย" — ถูกต้องแล้ว)
alter table public.drive_link enable row level security;

-- ===========================================================================
-- ส่วนที่เพิ่มภายหลัง — ประเมินแบบกลุ่มย่อย · ระบบให้คำปรึกษา · สุขภาพและความประพฤติ
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- eval_group — กลุ่มย่อยของรายวิชาปฏิบัติ
-- ---------------------------------------------------------------------------
-- นักศึกษาอ่านไม่ได้ เพราะจะรู้ว่าเพื่อนคนไหนอยู่กลุ่มใครและย้อนหาผู้ประเมินได้
alter table public.eval_group enable row level security;
drop policy if exists eg_read  on public.eval_group;
drop policy if exists eg_write on public.eval_group;
create policy eg_read  on public.eval_group for select to authenticated using (ems.is_staff());
create policy eg_write on public.eval_group for all    to authenticated
  using (ems.is_full()) with check (ems.is_full());

-- ---------------------------------------------------------------------------
-- counsel_session — บันทึกการให้คำปรึกษา
-- ---------------------------------------------------------------------------
-- อาจารย์เห็นและแก้เฉพาะของตน · ผู้ดูแล/วิชาการ/ทะเบียน เห็นทั้งหมด
-- เจ้าหน้าที่งานอื่นๆ เห็นเฉพาะรายการที่ตั้งสถานะว่า "ส่งต่อ" เท่านั้น
alter table public.counsel_session enable row level security;
drop policy if exists cs_read   on public.counsel_session;
drop policy if exists cs_insert on public.counsel_session;
drop policy if exists cs_update on public.counsel_session;
drop policy if exists cs_delete on public.counsel_session;
create policy cs_read on public.counsel_session for select to authenticated
  using (ems.counsel_sees_all()
      or ems.counsel_is_owner(advisor_name)
      or (ems.counsel_is_referral_staff() and coalesce(refer_status,'') = 'ส่งต่อ'));
create policy cs_insert on public.counsel_session for insert to authenticated
  with check (ems.counsel_sees_all() or ems.counsel_is_owner(advisor_name));
create policy cs_update on public.counsel_session for update to authenticated
  using (ems.counsel_sees_all() or ems.counsel_is_owner(advisor_name))
  with check (ems.counsel_sees_all() or ems.counsel_is_owner(advisor_name));
create policy cs_delete on public.counsel_session for delete to authenticated
  using (ems.counsel_sees_all() or ems.counsel_is_owner(advisor_name));

-- ---------------------------------------------------------------------------
-- counsel_student — รายชื่อนักศึกษาในแต่ละครั้ง (มีบันทึกส่วนตัวรายคน)
-- ---------------------------------------------------------------------------
-- สิทธิ์อิงจากรายการแม่เสมอ จึงไม่มีทางเห็นบันทึกส่วนตัวของครั้งที่ตนไม่มีสิทธิ์
alter table public.counsel_student enable row level security;
drop policy if exists cst_read  on public.counsel_student;
drop policy if exists cst_write on public.counsel_student;
create policy cst_read on public.counsel_student for select to authenticated
  using (exists (select 1 from public.counsel_session s
                 where s.session_code = counsel_student.session_code
                   and (ems.counsel_sees_all()
                     or ems.counsel_is_owner(s.advisor_name)
                     or (ems.counsel_is_referral_staff() and coalesce(s.refer_status,'') = 'ส่งต่อ'))));
create policy cst_write on public.counsel_student for all to authenticated
  using (exists (select 1 from public.counsel_session s
                 where s.session_code = counsel_student.session_code
                   and (ems.counsel_sees_all() or ems.counsel_is_owner(s.advisor_name))))
  with check (exists (select 1 from public.counsel_session s
                 where s.session_code = counsel_student.session_code
                   and (ems.counsel_sees_all() or ems.counsel_is_owner(s.advisor_name))));

-- ---------------------------------------------------------------------------
-- counsel_option — ประเภทประเด็นปัญหาและช่องทางการให้คำปรึกษา
-- ---------------------------------------------------------------------------
alter table public.counsel_option enable row level security;
drop policy if exists co_read  on public.counsel_option;
drop policy if exists co_write on public.counsel_option;
create policy co_read  on public.counsel_option for select to authenticated using (ems.is_staff());
create policy co_write on public.counsel_option for all    to authenticated
  using (ems.has_any_role(array['admin','academic']))
  with check (ems.has_any_role(array['admin','academic']));

-- ---------------------------------------------------------------------------
-- counsel_log — ประวัติการเปลี่ยนแปลง
-- ---------------------------------------------------------------------------
-- เขียนได้เสมอแต่ลบไม่ได้และแก้ไม่ได้ ประวัติจึงย้อนแก้ไม่ได้
alter table public.counsel_log enable row level security;
drop policy if exists cl_read   on public.counsel_log;
drop policy if exists cl_insert on public.counsel_log;
create policy cl_read on public.counsel_log for select to authenticated
  using (exists (select 1 from public.counsel_session s
                 where s.session_code = counsel_log.session_code
                   and (ems.counsel_sees_all() or ems.counsel_is_owner(s.advisor_name))));
create policy cl_insert on public.counsel_log for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- student_health — ข้อมูล สบช.โมเดล
-- ---------------------------------------------------------------------------
-- อ่าน  ผู้ดูแล/วิชาการ/ทะเบียน · เจ้าหน้าที่งานอื่นๆ · อาจารย์ที่ปรึกษาของนักศึกษารายนั้น
--       และตัวนักศึกษาเองเห็นของตัวเอง
-- เขียน เฉพาะผู้ที่ผู้ดูแลติ๊กสิทธิ์ให้ และแก้/ลบได้เฉพาะแถวที่ตนกรอก
--       เทียบจาก recorded_uid ซึ่งมาจากระบบยืนยันตัวตน ปลอมไม่ได้
alter table public.student_health enable row level security;
drop policy if exists sh_write  on public.student_health;
drop policy if exists sh_read   on public.student_health;
drop policy if exists sh_insert on public.student_health;
drop policy if exists sh_update on public.student_health;
drop policy if exists sh_delete on public.student_health;
create policy sh_read on public.student_health for select to authenticated
  using (ems.is_full()
      or ems.has_any_role(array['otherStaff'])
      or ems.owns_student(student_id)
      or student_id = ems.my_student_id());
create policy sh_insert on public.student_health for insert to authenticated
  with check (ems.can_enter_health());
create policy sh_update on public.student_health for update to authenticated
  using (ems.owns_record(recorded_uid) and ems.can_enter_health())
  with check (ems.owns_record(recorded_uid) and ems.can_enter_health());
create policy sh_delete on public.student_health for delete to authenticated
  using (ems.owns_record(recorded_uid) and ems.can_enter_health());

-- ---------------------------------------------------------------------------
-- student_conduct — ข้อมูลความประพฤติ
-- ---------------------------------------------------------------------------
-- กติกาเดียวกับตารางสุขภาพ แต่ใช้สิทธิ์คนละใบ
alter table public.student_conduct enable row level security;
drop policy if exists sh_write  on public.student_conduct;
drop policy if exists sh_read   on public.student_conduct;
drop policy if exists sc_read   on public.student_conduct;
drop policy if exists sc_insert on public.student_conduct;
drop policy if exists sc_update on public.student_conduct;
drop policy if exists sc_delete on public.student_conduct;
create policy sc_read on public.student_conduct for select to authenticated
  using (ems.is_full()
      or ems.has_any_role(array['otherStaff'])
      or ems.owns_student(student_id)
      or student_id = ems.my_student_id());
create policy sc_insert on public.student_conduct for insert to authenticated
  with check (ems.can_enter_conduct());
create policy sc_update on public.student_conduct for update to authenticated
  using (ems.owns_record(recorded_uid) and ems.can_enter_conduct())
  with check (ems.owns_record(recorded_uid) and ems.can_enter_conduct());
create policy sc_delete on public.student_conduct for delete to authenticated
  using (ems.owns_record(recorded_uid) and ems.can_enter_conduct());

-- ===========================================================================
-- ตัวตรวจภาระงานที่นักศึกษาบันทึกเอง (นอกเหนือจาก RLS)
-- ===========================================================================
-- ทำไมต้องมีนอกเหนือจากนโยบาย RLS
--   ภาระงานทั้งพันธกิจเก็บเป็นข้อความ JSON ก้อนเดียวในช่องเดียว และตอน
--   นักศึกษาเพิ่มรายการแรก ระบบต้องคัดลอกรายการของวิทยาลัยมาไว้ในก้อนนั้นด้วย
--   มิฉะนั้นรายการเดิมจะหาย  นโยบาย RLS มองเห็นแค่ว่าแถวนี้เป็นของรหัสใด
--   มองไม่ทะลุเข้าไปว่าข้างในข้อความถูกแก้อะไรบ้าง การจำกัดที่หน้าจอจึงถูกข้ามได้
--   ด้วยการยิงคำสั่งเข้า API ตรง ๆ  ตัวตรวจนี้ปิดช่องนั้น

-- รายชื่อนักศึกษาที่กิจกรรมหนึ่งแถวมีผลด้วย — รับทั้งอาร์เรย์และข้อความ
create or replace function ems.wl_participants(e jsonb) returns jsonb
language plpgsql immutable set search_path = pg_temp as $$
declare v jsonb;
begin
  v := e -> 'students';
  if v is null then return '[]'::jsonb; end if;
  if jsonb_typeof(v) = 'array' then return v; end if;
  if jsonb_typeof(v) = 'string' then
    begin
      v := (e ->> 'students')::jsonb;
      if jsonb_typeof(v) = 'array' then return v; end if;
    exception when others then return '[]'::jsonb;
    end;
  end if;
  return '[]'::jsonb;
end $$;

-- แถวนี้นับให้นักศึกษารายนี้หรือไม่ — ว่าง = นับให้ทุกคนในชั้น
create or replace function ems.wl_applies(e jsonb, sid text) returns boolean
language sql immutable set search_path = ems, pg_temp as $$
  select jsonb_array_length(ems.wl_participants(e)) = 0
      or ems.wl_participants(e) ? sid;
$$;

create or replace function ems.wl_is_self(e jsonb) returns boolean
language sql immutable set search_path = pg_temp as $$
  select coalesce(e ->> 'self', '') in ('1', 'true', 't');
$$;

-- ลายนิ้วมือของชุดรายการ ใช้เทียบว่าเป็นชุดเดียวกันโดยไม่สนลำดับ
create or replace function ems.wl_fingerprint(arr jsonb) returns text
language sql immutable set search_path = pg_temp as $$
  select coalesce(string_agg(x, E'\n' order by x), '')
  from (select (value)::text as x from jsonb_array_elements(coalesce(arr, '[]'::jsonb))) t;
$$;

create or replace function ems.workload_student_guard() returns trigger
language plpgsql security definer set search_path = ems, public, pg_temp as $$
declare
  my_sid     text;
  lvl        text;
  plan_rec   public.workload_plan%rowtype;
  plan_found boolean := false;
  fld        text;
  flds       text[] := array['research_json', 'service_json', 'student_json', 'personal_json'];
  nm         text;
  nms        text[] := array['พันธกิจด้านวิจัย', 'พันธกิจด้านบริการวิชาการ', 'พันธกิจด้านกิจการนักศึกษา', 'การใช้ชีวิตส่วนตัว'];
  i          int;
  got        jsonb;
  official   jsonb;
  mine       jsonb;
  e          jsonb;
  hrs        numeric;
begin
  -- เจ้าหน้าที่ที่ดูแลภาระงาน บันทึกได้ตามปกติ
  if ems.has_any_role(array['admin', 'academic', 'otherStaff']) then
    return new;
  end if;

  -- 1) เขียนได้เฉพาะระเบียนของตัวเอง
  my_sid := ems.my_student_id();
  if coalesce(my_sid, '') = '' or new.student_id is distinct from my_sid then
    raise exception 'บันทึกภาระงานของนักศึกษารายอื่นไม่ได้';
  end if;

  -- 2) ชั้นปียึดจากทะเบียน มิฉะนั้นจะอ้างชั้นปีอื่นเพื่อเทียบกับแผนที่หลวมกว่าได้
  select s.year_level into lvl from public.student s where s.student_id = my_sid limit 1;
  if coalesce(lvl, '') <> '' then new.year_level := lvl; end if;

  -- 3) ด้านวิชาการเป็นของวิทยาลัยอย่างเดียว ค่าว่าง = ระบบไปใช้ของแผนแทน
  new.teaching_json := null;

  select * into plan_rec from public.workload_plan p
   where p.academic_year = new.academic_year
     and p.year_level    = new.year_level
     and p.semester      = new.semester
   limit 1;
  plan_found := found;

  for i in 1 .. array_length(flds, 1) loop
    fld := flds[i];
    nm  := nms[i];

    begin
      got := coalesce(nullif(to_jsonb(new) ->> fld, ''), '[]')::jsonb;
    exception when others then
      raise exception 'ข้อมูล % ไม่ใช่รูปแบบที่ระบบรองรับ', nm;
    end;
    if jsonb_typeof(got) <> 'array' then
      raise exception 'ข้อมูล % ต้องเป็นรายการ', nm;
    end if;
    if jsonb_array_length(got) > 200 then
      raise exception '% มีรายการมากเกินไป', nm;
    end if;

    if not plan_found then
      official := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(v), '[]'::jsonb) into official
      from jsonb_array_elements(
             coalesce(nullif(to_jsonb(plan_rec) ->> fld, ''), '[]')::jsonb) v
      where ems.wl_applies(v, my_sid);
    end if;

    select coalesce(jsonb_agg(v), '[]'::jsonb) into mine
    from jsonb_array_elements(got) v
    where not ems.wl_is_self(v);

    -- 4) รายการที่ไม่ได้ติดป้าย "บันทึกเอง" ต้องตรงกับแผนของวิทยาลัยทุกตัว
    if ems.wl_fingerprint(mine) <> ems.wl_fingerprint(official) then
      raise exception 'แก้ไขหรือลบรายการที่วิทยาลัยกำหนดใน % ไม่ได้', nm;
    end if;

    -- 5) รายการที่บันทึกเองต้องมีชื่อ และชั่วโมงอยู่ในช่วงที่เป็นไปได้
    for e in select v from jsonb_array_elements(got) v where ems.wl_is_self(v) loop
      if coalesce(btrim(e ->> 'name'), '') = '' then
        raise exception 'รายการที่บันทึกเองใน % ต้องมีชื่อรายการ', nm;
      end if;
      begin
        hrs := (e ->> 'hours')::numeric;
      exception when others then
        hrs := null;
      end;
      if hrs is null or hrs <= 0 or hrs > 744 then
        raise exception 'จำนวนชั่วโมงของ "%" ใน % ไม่ถูกต้อง', coalesce(e ->> 'name', ''), nm;
      end if;
    end loop;
  end loop;

  return new;
end $$;

drop trigger if exists workload_student_guard on public.workload_student;
create trigger workload_student_guard
  before insert or update on public.workload_student
  for each row execute function ems.workload_student_guard();

revoke execute on function ems.workload_student_guard() from public, anon;
revoke execute on function ems.wl_participants(jsonb)   from public, anon;
revoke execute on function ems.wl_applies(jsonb, text)  from public, anon;
revoke execute on function ems.wl_is_self(jsonb)        from public, anon;
revoke execute on function ems.wl_fingerprint(jsonb)    from public, anon;

-- ===========================================================================
-- เลขบัตรประชาชนนักศึกษา — ข้อมูลอ่อนไหวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
-- ===========================================================================
-- เก็บแยกตาราง student_private ไม่ปนกับทะเบียนนักศึกษา เพื่อให้จำกัดสิทธิ์ได้คนละชุด
--   อ่าน   ผู้ดูแลระบบ · งานทะเบียน  เท่านั้น
--   บันทึก ผู้ดูแลระบบ · งานทะเบียน · งานวิชาการ
--          (งานวิชาการเพิ่มนักศึกษาใหม่ได้ แต่เปิดดูย้อนหลังไม่ได้)
--   ลบ     ผู้ดูแลระบบ
-- ทุกครั้งที่เปิดดู ระบบบันทึกไว้ว่าใครดูของใครเมื่อไร

create table if not exists public.nid_access_log (
  id          bigint generated by default as identity primary key,
  created_at  timestamptz not null default now(),
  viewer_uid  uuid        default auth.uid(),
  viewer_name text,
  student_ref bigint,
  student_id  text
);
comment on table public.nid_access_log is 'บันทึกการเปิดดูเลขบัตรประชาชน ตรวจสอบย้อนหลังได้';
create index if not exists nid_access_log_created_idx on public.nid_access_log (created_at desc);

alter table public.nid_access_log enable row level security;
drop policy if exists nal_read on public.nid_access_log;
create policy nal_read on public.nid_access_log for select to authenticated
  using (ems.has_any_role(array['admin']));
-- จงใจไม่มีนโยบายเขียน การบันทึกทำผ่านฟังก์ชัน security definer เท่านั้น
-- ผู้ใช้จึงลบหรือแก้ประวัติการเปิดดูของตัวเองไม่ได้

create or replace function ems.can_see_nid() returns boolean
language sql stable security definer set search_path = ems, public, pg_temp as $$
  select ems.has_any_role(array['admin','registrar']);
$$;
revoke execute on function ems.can_see_nid() from public, anon;
grant  execute on function ems.can_see_nid() to authenticated;

create or replace function ems.log_nid_view(p_ref bigint, p_sid text) returns void
language plpgsql volatile security definer set search_path = public, ems, pg_temp as $$
begin
  insert into public.nid_access_log (viewer_uid, viewer_name, student_ref, student_id)
  values (auth.uid(), ems.my_name(), p_ref, p_sid);
exception when others then
  null;   -- บันทึกประวัติไม่สำเร็จ ต้องไม่ทำให้การอ่านข้อมูลล้มเหลว
end $$;
revoke execute on function ems.log_nid_view(bigint, text) from public, anon;
grant  execute on function ems.log_nid_view(bigint, text) to authenticated;

-- ขอเลขเป็นรายคน ไม่เปิดให้ดึงทั้งตาราง และบันทึกการเปิดดูทุกครั้ง
create or replace function public.ems_student_nid(p_student_ref bigint)
returns text
language plpgsql stable security definer set search_path = public, ems, pg_temp as $$
declare v text; sid text;
begin
  if not ems.can_see_nid() then
    return null;
  end if;
  select sp.national_id, s.student_id into v, sid
  from public.student_private sp
  left join public.student s on s.id = sp.student_ref
  where sp.student_ref = p_student_ref
  limit 1;
  perform ems.log_nid_view(p_student_ref, sid);
  return coalesce(v, '');
end $$;
revoke execute on function public.ems_student_nid(bigint) from public, anon;
grant  execute on function public.ems_student_nid(bigint) to authenticated;

alter table public.student_private enable row level security;
drop policy if exists p_all     on public.student_private;
drop policy if exists sp_read   on public.student_private;
drop policy if exists sp_write  on public.student_private;
drop policy if exists sp_insert on public.student_private;
drop policy if exists sp_update on public.student_private;
drop policy if exists sp_delete on public.student_private;
create policy sp_read   on public.student_private for select to authenticated
  using (ems.can_see_nid());
create policy sp_insert on public.student_private for insert to authenticated
  with check (ems.is_full());
create policy sp_update on public.student_private for update to authenticated
  using (ems.is_full()) with check (ems.is_full());
create policy sp_delete on public.student_private for delete to authenticated
  using (ems.has_any_role(array['admin']));

-- ผู้ไม่ได้ล็อกอินไม่ควรมีสิทธิ์ระดับตารางค้างไว้ แม้ RLS จะกันอยู่แล้วก็ตาม
revoke all on public.student_private from anon;
revoke all on public.nid_access_log  from anon;
