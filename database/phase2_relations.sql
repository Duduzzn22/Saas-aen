-- Explicit relations for PostgREST's nested selections in the operations UI.
alter table public.class_schedules add constraint class_schedules_pool_fkey
  foreign key (organization_id,pool_id) references public.pools(organization_id,id) on delete restrict;
alter table public.class_sessions add constraint class_sessions_class_fkey
  foreign key (organization_id,class_id) references public.swim_classes(organization_id,id) on delete restrict;
create index sessions_class_idx on public.class_sessions(organization_id,class_id);
