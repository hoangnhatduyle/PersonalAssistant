-- Removes the feedback feature (0006_feedback.sql): the star-rating UI and
-- /api/feedback routes are gone, and the personalization suggestion
-- generator that read these rows has been removed with them. Existing
-- ratings/comments are permanently deleted.
--
-- personalization_suggestions is deliberately kept: pending suggestions can
-- still be applied/dismissed. Its source_feedback_ids column is a plain uuid[]
-- (no FK), so it stays as an inert audit trail of the (now-deleted) rows.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'feedback-retention-sweep') then
    perform cron.unschedule('feedback-retention-sweep');
  end if;
end;
$$;

drop function if exists public.sweep_expired_feedback();

-- Drops trg_guard_feedback_target_ownership and the RLS policies with it.
drop table if exists public.feedback_aggregates;
drop table if exists public.feedback;

drop function if exists public.guard_feedback_target_ownership();
