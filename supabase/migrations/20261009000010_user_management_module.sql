-- ====================================================================
-- SCC CRM Migration 010: Secure Admin User Management Module
-- Target: Supabase Cloud (zshihpvmtvwsbwrjpugy)
-- Capabilities:
--   1. RLS policy enhancement for profiles (admins can view all users)
--   2. Hardened trigger for profile update & deactivation safety
--   3. RPC: admin_create_user (Atomic Auth + Profile creation)
--   4. RPC: admin_update_user_profile (Admin profile editing)
--   5. RPC: admin_set_user_active (Account activation/deactivation)
--   6. RPC: admin_reset_user_password (Admin password reset)
--   7. Activity logs index & audit trail verification
-- Security: SECURITY DEFINER, explicit search_path, admin-only checks
-- Status: Local versioned migration (Pending Owner Production Approval)
-- ====================================================================

-- 1. Profiles Table RLS: Allow active administrators to see both active and inactive users
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

-- 2. Enhanced Safety Trigger: Protect last admin against deactivation & unauthorized edits
CREATE OR REPLACE FUNCTION public.trg_check_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_admin_count int;
BEGIN
  -- Prevent altering immutable identity columns
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Profile ID is immutable' USING ERRCODE = '42501';
  END IF;

  -- Role modification guard
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Caller must be a verified administrator
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify user roles'
        USING ERRCODE = '42501';
    END IF;

    -- Safety check: Prevent demoting the last active administrator
    IF OLD.id = auth.uid() AND NEW.role <> 'admin' THEN
      SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin' AND is_active = true;
      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'Safety violation: Cannot remove the last active administrator'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- Status (is_active) modification guard
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    -- Only administrators can activate or deactivate accounts
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify account active status'
        USING ERRCODE = '42501';
    END IF;

    -- Safety check: Prevent deactivating the last active administrator
    IF OLD.role = 'admin' AND OLD.is_active = true AND NEW.is_active = false THEN
      SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin' AND is_active = true;
      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'Safety violation: Cannot deactivate the last remaining active administrator'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Controlled Admin User Creation RPC
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_display_name text,
  p_role text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_catalog AS $$
DECLARE
  v_new_id uuid;
  v_clean_email text;
  v_clean_name text;
BEGIN
  -- 1. Verify caller is administrator
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can create new users' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate inputs
  v_clean_email := lower(trim(p_email));
  v_clean_name := trim(p_display_name);

  IF v_clean_email IS NULL OR v_clean_email = '' OR v_clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Invalid email address provided' USING ERRCODE = '22023';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters long' USING ERRCODE = '22023';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'recruiter') THEN
    RAISE EXCEPTION 'Invalid role: %. Permitted roles: admin, manager, recruiter', p_role USING ERRCODE = '22023';
  END IF;

  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    v_clean_name := split_part(v_clean_email, '@', 1);
  END IF;

  -- 3. Duplicate email check
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    RAISE EXCEPTION 'A user with email % already exists', v_clean_email USING ERRCODE = '23505';
  END IF;

  -- 4. Generate UUID and insert into auth.users
  v_new_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    role,
    aud,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    reauthentication_token,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    '00000000-0000-0000-0000-000000000000',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role),
    jsonb_build_object('display_name', v_clean_name),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    now(),
    now()
  );

  -- 5. Insert into auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', v_clean_email, 'email_verified', true),
    'email',
    v_clean_email,
    now(),
    now(),
    now()
  );

  -- 6. Upsert profile with intended role and details
  INSERT INTO public.profiles (id, email, display_name, role, phone, is_active, created_at, updated_at)
  VALUES (
    v_new_id,
    v_clean_email,
    v_clean_name,
    p_role,
    trim(p_phone),
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      phone = EXCLUDED.phone,
      updated_at = now();

  -- 7. Audit Log Entry
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'USER_CREATED',
    'profile',
    v_new_id,
    jsonb_build_object(
      'email', v_clean_email,
      'role', p_role,
      'display_name', v_clean_name
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_id,
    'email', v_clean_email,
    'display_name', v_clean_name,
    'role', p_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text) TO authenticated;

-- 4. Admin Profile Update RPC
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  target_user_id uuid,
  p_display_name text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog AS $$
DECLARE
  v_old_name text;
  v_clean_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can update staff profiles' USING ERRCODE = '42501';
  END IF;

  v_clean_name := trim(p_display_name);
  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    RAISE EXCEPTION 'Display name cannot be empty' USING ERRCODE = '22023';
  END IF;

  SELECT display_name INTO v_old_name FROM public.profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for ID %', target_user_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
  SET display_name = v_clean_name,
      phone = trim(p_phone),
      updated_at = now()
  WHERE id = target_user_id;

  -- Sync with auth.users metadata
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', v_clean_name),
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'USER_PROFILE_UPDATED',
    'profile',
    target_user_id,
    jsonb_build_object('old_name', v_old_name, 'new_name', v_clean_name, 'phone', trim(p_phone))
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'display_name', v_clean_name,
    'phone', trim(p_phone)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text) TO authenticated;

-- 5. Admin Set User Active Status RPC (Activate/Deactivate)
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  target_user_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_admin_count int;
  v_user_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can modify account active status' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_user_role FROM public.profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for ID %', target_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Prevent deactivating last active administrator
  IF v_user_role = 'admin' AND p_is_active = false THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin' AND is_active = true;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Safety violation: Cannot deactivate the last remaining active administrator' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    'profile',
    target_user_id,
    jsonb_build_object('is_active', p_is_active, 'role', v_user_role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'is_active', p_is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated;

-- 6. Admin Password Reset RPC
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_catalog AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can reset user passwords' USING ERRCODE = '42501';
  END IF;

  IF length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters long' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Auth user not found for ID %', target_user_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
    recovery_token = '',
    updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'USER_PASSWORD_RESET',
    'profile',
    target_user_id,
    jsonb_build_object('reset_by', auth.uid())
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(uuid, text) TO authenticated;

-- 7. Audit log entity indexing for performant activity viewing
CREATE INDEX IF NOT EXISTS idx_activity_logs_profile_entity 
  ON public.activity_logs(entity_type, entity_id) 
  WHERE entity_type = 'profile';
