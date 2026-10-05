-- One-off visits should be visible to the people who participate in them.
create policy sessions_makeup_portal_read on public.class_sessions for select to authenticated
using (exists (select 1 from public.makeup_requests m
  where m.organization_id = class_sessions.organization_id and m.target_session_id = class_sessions.id
    and m.status = 'approved' and private.guardian_of_student(m.organization_id,m.student_id)));
create policy classes_makeup_portal_read on public.swim_classes for select to authenticated
using (exists (select 1 from public.makeup_requests m
  where m.organization_id = swim_classes.organization_id and m.target_class_id = swim_classes.id
    and m.status = 'approved' and private.guardian_of_student(m.organization_id,m.student_id)));
create policy trials_teacher_read on public.trial_requests for select to authenticated
using (status = 'scheduled' and exists (select 1 from public.class_sessions s
  where s.organization_id = trial_requests.organization_id and s.id = trial_requests.session_id
    and private.teaches_class(s.organization_id,s.class_id)));
