-- Cover composite foreign keys used by the operational screens and checks.
create index attendance_class_session_idx on public.attendance(organization_id,class_id,session_id);
create index attendance_class_student_idx on public.attendance(organization_id,class_id,student_id);
create index attendance_actor_idx on public.attendance(recorded_by);
create index schedules_lane_idx on public.class_schedules(organization_id,pool_id,lane_id);
create index sessions_schedule_idx on public.class_sessions(organization_id,class_id,schedule_id);
create index teachers_user_idx on public.teachers(user_id) where user_id is not null;
