-- BOOGER ATLAS: anonymous submissions through a server-side Edge Function.
-- Raw records, region centroids, caches and rate limits are never exposed by the Data API.
create table public.atlas_regions (
  id text primary key check (id ~ '^(kr:legal:[0-9]{5}|osm:relation:[0-9]+)$'),
  name text not null, country text not null, country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  admin1 text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null,
  created_at timestamptz not null default now()
);
comment on column public.atlas_regions.latitude is 'Administrative reference coordinate. Never a user GPS coordinate.';
create table public.atlas_observations (
  id uuid primary key,
  region_id text not null references public.atlas_regions(id),
  found_on date not null check (found_on >= date '1940-01-01'),
  color text not null check (color in ('yellow','brown','dark-brown','green','black','other')),
  size text not null check (size in ('small','medium','large')),
  dryness smallint not null check (dryness between 1 and 5),
  created_at timestamptz not null default now()
);
create index atlas_observations_region_date on public.atlas_observations(region_id, found_on);
create index atlas_observations_date on public.atlas_observations(found_on);
create table public.atlas_api_cache (key text primary key, payload jsonb not null, expires_at timestamptz not null);
create index atlas_api_cache_expiry on public.atlas_api_cache(expires_at);
create table public.atlas_rate_limits (bucket text primary key, hits integer not null default 1, expires_at timestamptz not null);
create index atlas_rate_limits_expiry on public.atlas_rate_limits(expires_at);
create table public.atlas_service_slots (name text primary key, available_at timestamptz not null);

alter table public.atlas_regions enable row level security;
alter table public.atlas_observations enable row level security;
alter table public.atlas_api_cache enable row level security;
alter table public.atlas_rate_limits enable row level security;
alter table public.atlas_service_slots enable row level security;
-- Intentionally no anon/authenticated policies. Only the service role in the Edge Function has access.
revoke all on public.atlas_regions,public.atlas_observations,public.atlas_api_cache,public.atlas_rate_limits,public.atlas_service_slots from anon,authenticated;
grant all on public.atlas_regions,public.atlas_observations,public.atlas_api_cache,public.atlas_rate_limits,public.atlas_service_slots to service_role;

create or replace function public.atlas_take_rate(p_bucket text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_hits integer;
begin
  if p_limit < 1 or p_seconds < 1 then raise exception 'Invalid rate configuration'; end if;
  insert into atlas_rate_limits(bucket,hits,expires_at) values(p_bucket,1,now()+make_interval(secs=>p_seconds))
  on conflict(bucket) do update set
    hits=case when atlas_rate_limits.expires_at <= now() then 1 else atlas_rate_limits.hits+1 end,
    expires_at=case when atlas_rate_limits.expires_at <= now() then excluded.expires_at else atlas_rate_limits.expires_at end
  returning hits into v_hits;
  return v_hits<=p_limit;
end; $$;
create or replace function public.atlas_take_geocoder_slot()
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
 insert into atlas_service_slots(name,available_at) values('nominatim',clock_timestamp()+interval '1.1 seconds')
 on conflict(name) do update set available_at=excluded.available_at
 where atlas_service_slots.available_at<=clock_timestamp()
 returning name into v_name;
 return v_name is not null;
end; $$;
-- One JSON object avoids the PostgREST default row cap truncating aggregates.
create or replace function public.atlas_dataset()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'regions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'country',country,'countryCode',country_code,'admin1',admin1,'latitude',latitude,'longitude',longitude,'source',source) order by name) from atlas_regions),'[]'::jsonb),
 'cells',coalesce((select jsonb_agg(to_jsonb(a)) from (
   select region_id as "regionId",found_on as date,color,size,dryness,count(*)::integer as count
   from atlas_observations group by region_id,found_on,color,size,dryness
 ) a),'[]'::jsonb));
$$;
create or replace function public.atlas_cleanup()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from atlas_api_cache where expires_at < now()-interval '1 day';
 delete from atlas_rate_limits where expires_at < now();
end; $$;
revoke all on function public.atlas_take_rate(text,integer,integer),public.atlas_take_geocoder_slot(),public.atlas_dataset(),public.atlas_cleanup() from public,anon,authenticated;
grant execute on function public.atlas_take_rate(text,integer,integer),public.atlas_take_geocoder_slot(),public.atlas_dataset(),public.atlas_cleanup() to service_role;

insert into public.atlas_regions(id,name,country,country_code,admin1,latitude,longitude,source) values
('kr:legal:11680','강남구','대한민국','KR','서울특별시',37.5172,127.0473,'행정표준코드 · 법정동 시군구 코드'),
('kr:legal:11440','마포구','대한민국','KR','서울특별시',37.5663,126.9019,'행정표준코드 · 법정동 시군구 코드'),
('kr:legal:11110','종로구','대한민국','KR','서울특별시',37.573,126.9794,'행정표준코드 · 법정동 시군구 코드'),
('kr:legal:26350','해운대구','대한민국','KR','부산광역시',35.1631,129.1635,'행정표준코드 · 법정동 시군구 코드'),
('kr:legal:50110','제주시','대한민국','KR','제주특별자치도',33.4996,126.5312,'행정표준코드 · 법정동 시군구 코드');
-- No sample observations are seeded into production.
