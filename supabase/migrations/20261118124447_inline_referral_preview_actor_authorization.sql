-- SECURITY INVOKER functions cannot call revoked private guards. Authorize
-- directly through tenant-scoped membership/capability rows, then let table RLS
-- remain the final row boundary for the PII-bearing preview.
create or replace function public.preview_mortgage_referral_partner_duplicates(
  p_organisation_id uuid,p_name text,p_organisation_name text,p_email text
) returns table(
  referral_partner_id uuid,partner_name text,organisation_name text,
  email text,status text,reasons text[]
) language plpgsql stable security invoker set search_path='' as $$
declare n_name text:=nullif(regexp_replace(lower(btrim(coalesce(p_name,''))),'[[:space:]]+',' ','g'),'');
  n_org text:=nullif(regexp_replace(lower(btrim(coalesce(p_organisation_name,''))),'[[:space:]]+',' ','g'),'');
  n_email text:=nullif(lower(btrim(coalesce(p_email,''))),'');actor_membership uuid;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select m.id into actor_membership from public.organisation_memberships m
  where m.organisation_id=p_organisation_id and m.user_id=auth.uid() and m.status='Active';
  if actor_membership is null then raise exception 'ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.membership_capabilities c where c.organisation_id=p_organisation_id and c.membership_id=actor_membership and c.capability='mortgage.referral.manage') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.referral.manage' using errcode='42501'; end if;
  if not exists(select 1 from public.membership_capabilities c where c.organisation_id=p_organisation_id and c.membership_id=actor_membership and c.capability='mortgage.referral.view') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.referral.view' using errcode='42501'; end if;
  if n_name is null then raise exception 'REFERRAL_NAME_REQUIRED' using errcode='22023'; end if;
  return query select r.id,r.name,r.organisation_name,r.email,r.status,
    array_remove(array[
      case when n_email is not null and r.email_normalized=n_email then 'exact_email' end,
      case when n_org is not null and r.name_normalized=n_name and r.organisation_name_normalized=n_org then 'normalized_name_and_organisation' end,
      case when n_org is null and r.name_normalized=n_name and r.organisation_name_normalized is null then 'exact_normalized_name_without_organisation' end
    ],null)::text[]
  from public.mortgage_referral_partners r where r.organisation_id=p_organisation_id and(
    (n_email is not null and r.email_normalized=n_email)
    or(n_org is not null and r.name_normalized=n_name and r.organisation_name_normalized=n_org)
    or(n_org is null and r.name_normalized=n_name and r.organisation_name_normalized is null))
  order by r.name_normalized,r.id;
end
$$;
revoke all on function public.preview_mortgage_referral_partner_duplicates(uuid,text,text,text) from public,anon;
grant execute on function public.preview_mortgage_referral_partner_duplicates(uuid,text,text,text) to authenticated;
