// ==========================================================================
// 1. FRESH GLOBAL SUPABASE INITIALIZATION
// ==========================================================================

// ⚠️ PASTE YOUR BRAND NEW SUPABASE PROJECT CREDENTIALS HERE ⚠️
const SUPABASE_URL = "https://srexdwtbuaevlkbnvdoy.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyZXhkd3RidWFldmxrYm52ZG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDcwNDMsImV4cCI6MjA5NDc4MzA0M30.PMClOZCg7haWIS0N5hY_9-sjyXPQUwYTXvVt0ZgZwmQ";

// Dynamic Instance Guard: This prevents your browser from crashing with duplicate declaration errors.
if (!window.gotegsSupabaseInstance) {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_NEW")) {
    // We use the window.supabase object provided automatically by the CDN script
    window.gotegsSupabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("🚀 Gotegs Auth Engine: Core communication database channel opened successfully.");
  } else {
    console.warn("Supabase Configuration Notice: Please make sure to fill out your new credentials at the top of auth.js");
  }
}

// FIX: Renamed from 'supabase' to 'supabaseClient' to completely eliminate the declaration crash!
const supabaseClient = window.gotegsSupabaseInstance;

// ==========================================================================
// 2. FORM DETECTION AND EVENT ROUTING HANDLERS
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const forgotPasswordForm = document.getElementById('forgot-password-form');
  const updatePasswordForm = document.getElementById('update-password-form');

  if (signupForm) {
    console.log("📌 Interceptor active: Signup Form Ready");
    signupForm.addEventListener('submit', handleSignUp);
  }
  if (loginForm) {
    console.log("📌 Interceptor active: Login Form Ready");
    loginForm.addEventListener('submit', handleLogin);
  }
  if (forgotPasswordForm) {
    console.log("📌 Interceptor active: Recovery Request Form Ready");
    forgotPasswordForm.addEventListener('submit', handleForgotPassword);
  }
  if (updatePasswordForm) {
    console.log("📌 Interceptor active: Password Update Form Ready");
    updatePasswordForm.addEventListener('submit', handleUpdatePassword);
  }
});

// ==========================================================================
// 3. PIPELINE ACTION FUNCTIONS
// ==========================================================================

// --- SIGN UP ROUTINE ---
async function handleSignUp(e) {
  e.preventDefault();
  console.log("⚡ Triggered: Registration submission intercept.");

  const fullName = document.getElementById('reg-fullname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const role = document.getElementById('reg-role').value;
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm').value;
  const consent = document.getElementById('reg-consent').checked;

  if (!fullName || !email || !phone || !role || !password) {
    alert("Please populate all required fields.");
    return;
  }
  if (password !== confirmPassword) {
    alert("Validation Error: Passwords do not match!");
    return;
  }
  if (!consent) {
    alert("You must consent to notification alerts to join the portal.");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          phone_number: phone,
          role: role,
          email_consent: consent
        }
      }
    });

    if (error) throw error;

    if (data.user) {
      alert(`🎉 Success!\n\nA secure activation link has been routed to ${email}. Please confirm it to initialize your profile.`);
      document.getElementById('signup-form').reset();
      window.location.href = 'login.html';
    }
  } catch (error) {
    alert(`Registration System Error: ${error.message}`);
    console.error(error);
  }
}

// --- PORTAL GATEWAY LOGIN ROUTINE ---
async function handleLogin(e) {
  e.preventDefault();
  console.log("⚡ Triggered: Secure Gateway Login processing.");

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    alert("Please enter both your email and password.");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    if (data.session) {
      alert("🔒 Authorization Verified! Accessing your dashboard...");
      window.location.href = 'index.html';
    }
  } catch (error) {
    alert(`Authentication Failed: ${error.message}`);
    console.error(error);
  }
}

// --- PASSWORD RECOVERY DISPATCH ROUTINE ---
async function handleForgotPassword(e) {
  e.preventDefault();
  console.log("⚡ Triggered: Instigating account identity recovery.");

  const email = document.getElementById('recovery-email').value.trim();

  if (!email) {
    alert("Please enter your registered email address.");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/update-password.html',
    });

    if (error) throw error;

    alert(`📬 Recovery token routed!\n\nCheck your email inbox for your secure credentials modifier link.`);
    document.getElementById('forgot-password-form').reset();
  } catch (error) {
    alert(`Recovery Routing Failed: ${error.message}`);
    console.error(error);
  }
}

// --- CREDENTIALS UPDATE COMMIT ROUTINE ---
async function handleUpdatePassword(e) {
  e.preventDefault();
  console.log("⚡ Triggered: Applying security credentials update.");

  const newPassword = document.getElementById('update-password').value;
  const confirmNewPassword = document.getElementById('update-confirm').value;

  if (!newPassword || !confirmNewPassword) {
    alert("Please complete all password input fields.");
    return;
  }
  if (newPassword !== confirmNewPassword) {
    alert("Validation Error: Your new passwords do not match!");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    alert("🛡️ Security Credentials Updated! Your new password is now active.");
    document.getElementById('update-password-form').reset();
    window.location.href = 'login.html';
  } catch (error) {
    alert(`Credential Update Blocked: ${error.message}`);
    console.error(error);
  }
}
