// ==========================================================================
// SUPABASE CLIENT INITIALIZATION
// ==========================================================================

// ⚠️ PASTE YOUR SECURE CREDENTIALS HERE WHEN READY ⚠️
const SUPABASE_URL = "https://lbrxpivnrdiupjorljci.supabase.co/rest/v1/"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxicnhwaXZucmRpdXBqb3JsamNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODU5OTAsImV4cCI6MjA5NDc2MTk5MH0.spQfI7yG1GlrNdLMkMj8drg_aVg4eUewK4JfpmcqoYs";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase Error: Please configure your SUPABASE_URL and SUPABASE_ANON_KEY inside assets/js/auth.js");
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================================================
// FORM DETECTION AND EVENT ROUTING
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const forgotPasswordForm = document.getElementById('forgot-password-form');
  const updatePasswordForm = document.getElementById('update-password-form');

  if (signupForm) signupForm.addEventListener('submit', handleSignUp);
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', handleForgotPassword);
  if (updatePasswordForm) updatePasswordForm.addEventListener('submit', handleUpdatePassword);
});

// ==========================================================================
// 1. SIGN UP PIPELINE (WITH CUSTOM METADATA DISPATCH)
// ==========================================================================

async function handleSignUp(e) {
  e.preventDefault();

  const fullName = document.getElementById('reg-fullname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const role = document.getElementById('reg-role').value;
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm').value;
  const consent = document.getElementById('reg-consent').checked;

  // Frontend Validation Checks
  if (!fullName || !email || !phone || !role || !password) {
    alert("Please populate all required fields.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Validation Error: Passwords do not match!");
    return;
  }

  if (!consent) {
    alert("You must consent to email messaging notifications to join the portal.");
    return;
  }

  try {
    // 1. Execute Auth Sign Up via Supabase
    // We pass extra fields into 'options.data' so Supabase saves them as user_metadata
    const { data, error } = await supabase.auth.signUp({
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

    // 2. Check if user is instantly created but needs verification
    if (data.user) {
      alert(`🎉 Registration submitted successfully!\n\nA secure confirmation link has been routed to ${email}. Please check your inbox (and spam folder) to activate your account.`);
      document.getElementById('signup-form').reset();
      window.location.href = 'login.html';
    }

  } catch (error) {
    alert(`Registration Failed: ${error.message}`);
    console.error(error);
  }
}

// ==========================================================================
// 2. SECURE PORTAL LOGIN PIPELINE
// ==========================================================================

async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    alert("Please enter both email and password fields.");
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    if (data.session) {
      // Token is automatically managed by the SDK, but we manually notify the user
      alert("🔒 Authorization Verified! Redirecting to your school dashboard...");
      
      // For testing redirection purposes, we forward them back to home. 
      // Our route guard in ui.js will now recognize them as authenticated!
      window.location.href = 'index.html';
    }

  } catch (error) {
    alert(`Authentication Failed: ${error.message}`);
    console.error(error);
  }
}

// ==========================================================================
// 3. PASSWORD RECOVERY DISPATCH (STEP 1)
// ==========================================================================

async function handleForgotPassword(e) {
  e.preventDefault();

  const email = document.getElementById('recovery-email').value.trim();

  if (!email) {
    alert("Please enter your registered email address.");
    return;
  }

  try {
    // We instruct Supabase where to redirect the user when they click the email link.
    // GitHub Pages deployment paths can be dropped directly here!
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/update-password.html',
    });

    if (error) throw error;

    alert(`📬 Secure recovery verification link dispatched!\n\nIf an account exists for ${email}, an encrypted validation link will arrive shortly.`);
    document.getElementById('forgot-password-form').reset();

  } catch (error) {
    alert(`Recovery Dispatch Failed: ${error.message}`);
    console.error(error);
  }
}

// ==========================================================================
// 4. CREDENTIALS MODIFICATION COMMIT (STEP 2)
// ==========================================================================

async function handleUpdatePassword(e) {
  e.preventDefault();

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
    // Modifies the password for the user currently holding the temporary email token session
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    alert("🛡️ Security Credentials Updated! Your new password is now active.");
    document.getElementById('update-password-form').reset();
    
    // Send them back to the clean slate login page
    window.location.href = 'login.html';

  } catch (error) {
    alert(`Password Modification Failed: ${error.message}`);
    console.error(error);
  }
}
