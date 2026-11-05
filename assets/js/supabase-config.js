// ==========================================================================
// Supabase connection config
// Fill in your own values from: Supabase Dashboard -> Project Settings -> API
// The anon key is safe to expose in front-end code (that's how Supabase works),
// access is controlled by the Row Level Security policies set in the SQL editor.
// ==========================================================================

const SUPABASE_URL = "https://srexdwtbuaevlkbnvdoy.supabase.co";       // e.g. https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyZXhkd3RidWFldmxrYm52ZG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDcwNDMsImV4cCI6MjA5NDc4MzA0M30.PMClOZCg7haWIS0N5hY_9-sjyXPQUwYTXvVt0ZgZwmQ";     // long string from Project Settings -> API

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
