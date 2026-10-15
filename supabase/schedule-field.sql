-- Run AFTER both migrations and the field function deployment.
-- Dashboard > Vault: add field_function_url and field_cron_secret first.
-- field_function_url = https://YOUR_PROJECT_REF.supabase.co/functions/v1/field
-- field_cron_secret = the SAME random >=32-character secret in Edge Function FIELD_CRON_SECRET.
-- Never put either secret into VITE_* or source control.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='booger-field-weather';
select cron.schedule('booger-field-weather','*/5 * * * *',$$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='field_function_url' limit 1),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='field_cron_secret' limit 1)),
  body := '{"action":"tick"}'::jsonb,
  timeout_milliseconds := 120000
 );
$$);
-- Poll every 5 minutes; state advances at most once per real elapsed weather hour.
-- Inspect cron.job_run_details AND net._http_response for HTTP status and body.unavailable.
