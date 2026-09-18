-- =====================================================================
-- Home Weavers — send orders to ShipStation after the cancellation window
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run (once)
-- What:   every 5 minutes, asks the "hw" Edge Function to accept paid orders
--         whose free cancellation window has passed. The function only ever
--         accepts orders that are already due, so the call needs no key.
-- Change the address below if your project reference is different.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Remove an earlier version of the job, if any.
do $$
begin
  perform cron.unschedule('hw-release-orders');
exception when others then
  null;
end $$;

select cron.schedule(
  'hw-release-orders',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url     := 'https://soydgxrrwozmiqzutypr.supabase.co/functions/v1/hw/orders/release',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb
    );
  $job$
);

-- Check it:            select jobname, schedule, active from cron.job;
-- Recent runs:         select status, return_message, start_time from cron.job_run_details
--                        where jobid = (select jobid from cron.job where jobname = 'hw-release-orders')
--                        order by start_time desc limit 5;
-- Stop it:             select cron.unschedule('hw-release-orders');
