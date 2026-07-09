import { createClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://mfgstfazcrpvwxydczrd.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l4KC_0odqM5NYIuYV1uGQg_Kwz15Gra';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
