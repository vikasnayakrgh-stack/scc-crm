import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Client with caller's JWT to verify admin status
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired caller session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is active admin in profiles
    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', callerUser.id)
      .single();

    if (profileError || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Administrator privileges required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input payload
    const body = await req.json();
    const { email, password, display_name, role, phone } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const permittedRoles = ['admin', 'manager', 'recruiter'];
    if (!role || !permittedRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role: ${role}. Permitted: ${permittedRoles.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin Client with Service Role Key (Secure on server only)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        display_name: display_name?.trim() || email.split('@')[0],
      },
      app_metadata: {
        role,
      },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert profile record
    const { error: profileUpsertError } = await adminClient
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        email: email.trim().toLowerCase(),
        display_name: display_name?.trim() || email.split('@')[0],
        role,
        phone: phone ? phone.trim() : null,
        is_active: true,
        updated_at: new Date().toISOString(),
      });

    if (profileUpsertError) {
      console.warn('Profile upsert warning:', profileUpsertError);
    }

    // Record audit log
    await adminClient.from('activity_logs').insert({
      user_id: callerUser.id,
      action: 'USER_CREATED',
      entity_type: 'profile',
      entity_id: newUser.user.id,
      details: {
        email: email.trim().toLowerCase(),
        role,
        display_name: display_name?.trim() || email.split('@')[0],
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        email: newUser.user.email,
        role,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
