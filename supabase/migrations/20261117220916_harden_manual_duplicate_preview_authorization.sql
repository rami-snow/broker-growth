-- Ensure authentication and exact capability validation cannot be optimized
-- away when a duplicate preview has zero matching rows.
create or replace function public.preview_mortgage_manual_contact_duplicates(
  p_organisation_id uuid,p_given_name text,p_family_name text,p_email text,p_phone text
) returns table(
  contact_id uuid,contact_name text,email text,phone text,reasons text[],households jsonb
) language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
  perform private.require_operation_actor(p_organisation_id,'mortgage.household.create');
  return query
  with input as (
    select private.normalise_contact_email(p_email) email,
      private.normalise_contact_phone(p_phone) phone,
      private.normalise_contact_name(p_given_name,p_family_name) full_name
  ), matched as (
    select c.*,
      array_remove(array[
        case when i.email is not null and c.email_normalized=i.email then 'exact_email' end,
        case when i.phone is not null and c.phone_normalized=i.phone then 'exact_phone' end,
        case when i.full_name<>' ' and private.normalise_contact_name(c.given_name,c.family_name)=i.full_name
          then 'normalized_full_name' end
      ],null)::text[] match_reasons
    from public.contacts c cross join input i
    where c.organisation_id=p_organisation_id and (
      (i.email is not null and c.email_normalized=i.email)
      or (i.phone is not null and c.phone_normalized=i.phone)
      or (i.full_name<>' ' and private.normalise_contact_name(c.given_name,c.family_name)=i.full_name)
    )
  )
  select m.id,btrim(m.given_name)||' '||btrim(m.family_name),m.email,m.phone,m.match_reasons,
    coalesce((select jsonb_agg(jsonb_build_object(
      'householdId',h.id,'householdName',h.display_name,'householdStatus',h.status,
      'relationship',hm.relationship,'isPrimary',hm.is_primary
    ) order by h.display_name,h.id)
    from public.mortgage_household_members hm
    join public.mortgage_households h
      on h.organisation_id=hm.organisation_id and h.id=hm.household_id
    where hm.organisation_id=p_organisation_id and hm.contact_id=m.id),'[]'::jsonb)
  from matched m order by m.given_name,m.family_name,m.id;
end
$$;

revoke all on function public.preview_mortgage_manual_contact_duplicates(uuid,text,text,text,text)
  from public,anon;
grant execute on function public.preview_mortgage_manual_contact_duplicates(uuid,text,text,text,text)
  to authenticated;
