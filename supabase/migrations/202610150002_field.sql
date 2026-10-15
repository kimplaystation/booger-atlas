-- Additive migration: existing observations and aggregate contract remain intact.
alter table public.atlas_observations drop constraint atlas_observations_color_check;
alter table public.atlas_observations add constraint atlas_observations_color_check check (color in ('light-yellow','yellow','brown','dark-brown','green','black','other'));
create table public.atlas_field_specimens (
 id uuid primary key references public.atlas_observations(id),
 state jsonb not null,
 revision integer not null default 0,
 last_tick timestamptz not null,
 status text not null check(status in ('alive','dissolved')),
 check(jsonb_typeof(state)='object')
);
comment on table public.atlas_field_specimens is 'Private game state. Initial position is snapped to 20m. Exact device GPS is never stored. Not publicly queryable.';
create index atlas_field_due on public.atlas_field_specimens(last_tick) where status='alive';
create table public.atlas_field_events (
 specimen_id uuid not null references public.atlas_field_specimens(id),
 at timestamptz not null,
 event jsonb not null,
 primary key(specimen_id,at)
);
alter table public.atlas_field_specimens enable row level security;
alter table public.atlas_field_events enable row level security;
revoke all on public.atlas_field_specimens,public.atlas_field_events from anon,authenticated;
grant all on public.atlas_field_specimens,public.atlas_field_events to service_role;
create or replace function public.atlas_field_create(p_state jsonb,p_event jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing jsonb; v_id uuid := (p_state->>'id')::uuid;
begin
 -- One transaction; concurrent retry of the same UUID cannot duplicate an observation/event.
 perform pg_advisory_xact_lock(hashtext(v_id::text));
 select state into existing from atlas_field_specimens where id=v_id;
 if found then return existing; end if;
 insert into atlas_observations(id,region_id,found_on,color,size,dryness) values(v_id,p_state#>>'{region,id}',(p_state->>'createdAt')::timestamptz::date,p_state->>'color',p_state->>'size',(p_state->>'initialDryness')::smallint);
 insert into atlas_field_specimens(id,state,last_tick,status) values(v_id,p_state,(p_state->>'lastTick')::timestamptz,'alive');
 insert into atlas_field_events(specimen_id,at,event) values(v_id,(p_event->>'at')::timestamptz,p_event);
 return p_state;
end; $$;
create or replace function public.atlas_field_tick(p_id uuid,p_revision integer,p_state jsonb,p_event jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update atlas_field_specimens set state=p_state,revision=p_revision+1,last_tick=(p_state->>'lastTick')::timestamptz,status=p_state->>'status'
 where id=p_id and revision=p_revision and status='alive' and (p_state->>'lastTick')::timestamptz=last_tick+interval '1 hour';
 if not found then return false; end if;
 insert into atlas_field_events(specimen_id,at,event) values(p_id,(p_event->>'at')::timestamptz,p_event);
 return true;
end; $$;
revoke all on function public.atlas_field_create(jsonb,jsonb),public.atlas_field_tick(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.atlas_field_create(jsonb,jsonb),public.atlas_field_tick(uuid,integer,jsonb,jsonb) to service_role;

-- Server-only geographic query searches ALL living specimens, not the bounded world feed.
create or replace function public.atlas_field_nearby(p_lat double precision,p_lon double precision,p_radius double precision)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(q.state order by q.meters),'[]'::jsonb) from (
  select state,6371000*2*asin(sqrt(least(1.0,
   power(sin(radians((state#>>'{position,latitude}')::double precision-p_lat)/2),2)+
   cos(radians(p_lat))*cos(radians((state#>>'{position,latitude}')::double precision))*
   power(sin(radians((state#>>'{position,longitude}')::double precision-p_lon)/2),2)
  ))) as meters
  from atlas_field_specimens where status='alive'
 ) q where q.meters <= least(200,greatest(10,p_radius));
$$;
revoke all on function public.atlas_field_nearby(double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.atlas_field_nearby(double precision,double precision,double precision) to service_role;
