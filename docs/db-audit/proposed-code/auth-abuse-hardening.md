# Proposal: configure anonymous-auth abuse controls

This is a deployment proposal, not an applied change.

1. Enable a Supabase-supported CAPTCHA provider (Turnstile or hCaptcha) for anonymous sign-in in every hosted environment.
2. Add a scheduled, reviewed retention process for stale anonymous `auth.users`, preserving any accounts required by active matches or support workflows.
3. Exercise the configured IP limits from an approved staging environment and alert on unexpected account-growth rates.

Do not add provider secrets to the repository or SQL migrations.
