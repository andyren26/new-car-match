-- Trigger functions are never meant to be called over the API.
revoke execute on function public.listings_before_insert() from public, anon, authenticated;
revoke execute on function public.reports_after_insert() from public, anon, authenticated;
revoke execute on function public.listings_before_update() from public, anon, authenticated;
revoke execute on function public.listing_photos_limit() from public, anon, authenticated;
revoke execute on function public.profiles_reset_verification() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
