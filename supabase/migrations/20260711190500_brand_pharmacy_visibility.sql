drop policy if exists pharmacies_brand_select on public.pharmacies;

create policy pharmacies_brand_select
on public.pharmacies
for select
to authenticated
using (
  exists (
    select 1
    from public.pharmacy_brand_relations pbr
    where pbr.pharmacy_id = pharmacies.id
      and public.has_brand_access(pbr.brand_id)
  )
);
