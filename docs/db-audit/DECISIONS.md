# Audit decisions

- FAST mode is selected because the user did not request DEEP.
- Local Supabase/Docker access is treated as unavailable until a safe local stack command proves otherwise; remote projects will not be modified or queried beyond permitted read-only status checks.
- No secrets, environment values, connection strings, or data-bearing dumps are included in audit artifacts.
