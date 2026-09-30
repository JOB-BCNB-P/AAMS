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

-- เลขบัตรประชาชนเก็บแยกตาราง เห็นได้เฉพาะ admin/academic/registrar
-- หน้าเว็บไม่โหลดตารางนี้มาทั้งก้อน แต่ถามทีละคนผ่าน ems_student_nid()
-- ซึ่งปิดบังสามตัวท้ายมาจากฐานข้อมูลแล้ว
alter table public.student_private enable row level security;
drop policy if exists p_all on public.student_private;
create policy p_all on public.student_private for all to authenticated
  using (ems.is_full()) with check (ems.is_full());

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

-- กลุ่มย่อยของวิชาปฏิบัติ — ในตารางมีรายชื่อนักศึกษาทั้งกลุ่ม
-- นักศึกษาจึงอ่านตรง ๆ ไม่ได้ ต้องถามชื่อกลุ่มของตัวเองผ่าน ems_eval_my_groups()
alter table public.eval_group enable row level security;
drop policy if exists eg_read on public.eval_group;
drop policy if exists eg_write on public.eval_group;
create policy eg_read on public.eval_group for select to public using (ems.is_staff());
create policy eg_write on public.eval_group for all to public
  using (ems.is_full()) with check (ems.is_full());

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
