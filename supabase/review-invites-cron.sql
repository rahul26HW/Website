-- =====================================================================
-- Home Weavers — ask how an order went, a few days after it arrived
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run (once)
-- What:   once a day, asks the "hw" Edge Function to email customers whose
--         order was delivered a few days ago and who have not been asked yet.
--         The function only ever emails orders that are already due, so the
--         call needs no key — the same arrangement as hw-release-orders.
--
-- Run supabase/reviews.sql first: this needs the orders.review_invited_at
-- column it adds, which is how nobody gets asked twice.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('hw-review-invites');
exception when others then
  null;
end $$;

-- 15:00 UTC is mid-morning in New Jersey: a reasonable hour to land in an inbox.
select cron.schedule(
  'hw-review-invites',
  '0 15 * * *',
  $job$
    select net.http_post(
      url     := 'https://soydgxrrwozmiqzutypr.supabase.co/functions/v1/hw/reviews/invite',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb
    );
  $job$
);

-- Check it:    select jobname, schedule, active from cron.job;
-- Recent runs: select status, return_message, start_time from cron.job_run_details
--                where jobid = (select jobid from cron.job where jobname = 'hw-review-invites')
--                order by start_time desc limit 5;
-- Stop it:     select cron.unschedule('hw-review-invites');
