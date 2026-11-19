-- Keep the duplicate preview an ordinary SECURITY INVOKER/RLS read without
-- granting authenticated callers access to private normalization helpers.
create or replace function public.preview_mortgage_referral_partner_duplicates(
  p_organisation_id uuid,p_name text,p_organisation_name text,p_email text
) returns table(
  referral_partner_id uuid,partner_name text,organisation_name text,
  email text,status text,reasons text[]
) language plpgsql stable security invoker set search_path='' as $$
declare n_name text:=nullif(regexp_replace(lower(btrim(coalesce(p_name,''))),'[[:space:]]+',' ','g'),'');
  n_org text:=nullif(regexp_replace(lower(btrim(coalesce(p_organisation_name,''))),'[[:space:]]+',' ','g'),'');
  n_email text:=nullif(lower(btrim(coalesce(p_email,''))),'');
begin
  -- The public actor check derives auth.uid() and verifies both active tenant
  -- membership and the exact manage/view capabilities before the RLS query.
  perform private.require_referral_actor(p_organisation_id,'mortgage.referral.manage');
  if n_name is null then raise exception 'REFERRAL_NAME_REQUIRED' using errcode='22023'; end if;
  return query
  select r.id,r.name,r.organisation_name,r.email,r.status,
    array_remove(array[
      case when n_email is not null and r.email_normalized=n_email then 'exact_email' end,
      case when n_org is not null and r.name_normalized=n_name
        and r.organisation_name_normalized=n_org then 'normalized_name_and_organisation' end,
      case when n_org is null and r.name_normalized=n_name
        and r.organisation_name_normalized is null then 'exact_normalized_name_without_organisation' end
    ],null)::text[]
  from public.mortgage_referral_partners r
  where r.organisation_id=p_organisation_id and (
    (n_email is not null and r.email_normalized=n_email)
    or (n_org is not null and r.name_normalized=n_name and r.organisation_name_normalized=n_org)
    or (n_org is null and r.name_normalized=n_name and r.organisation_name_normalized is null)
  ) order by r.name_normalized,r.id;
end
$$;
revoke all on function public.preview_mortgage_referral_partner_duplicates(uuid,text,text,text)
  from public,anon;
grant execute on function public.preview_mortgage_referral_partner_duplicates(uuid,text,text,text)
  to authenticated;
