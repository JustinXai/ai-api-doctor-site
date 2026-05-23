# Security Policy

## Scope

AI API Doctor is a browser-based OpenAI-compatible API preflight checker. It helps users test Base URL, API Key, Model ID, usage fields, cache signals, model identity signals, latency stability, and client config export.

## API Key handling

- API keys are used only in the current browser session to send test requests to the user-provided Base URL.
- AI API Doctor does not require users to upload API keys to an AI API Doctor backend.
- Reports and copied summaries should mask sensitive values.
- Users should prefer temporary test keys when possible.
- After testing, users can revoke or rotate the key in their provider dashboard.

## Do not share secrets

Please do not post any of the following in public GitHub issues:

- Full API keys
- Full Authorization headers
- Full private Base URLs with embedded tokens
- Provider dashboard screenshots that include balances, tokens, or account IDs
- Full raw API responses if they contain sensitive data

Use masked examples instead:

- `sk-****abcd`
- `https://api***.example.com/v1`
- `Bearer sk-****abcd`

## Reporting a vulnerability

If you believe you found a security issue, please do not open a public issue with sensitive details.

Use one of the following safe options:

1. Open a GitHub issue without secrets and describe the general category.
2. If GitHub private vulnerability reporting is enabled, use GitHub Security Advisories.
3. If a contact email exists in the project, use that email.

**Security contact:** please open a minimal GitHub issue without secrets and request a private contact channel.

## Recommended user practice

- Use a temporary test key.
- Set low quota or spending limits if your provider supports it.
- Rotate the key after testing if needed.
- Check provider billing / balance after running tests.
- Avoid testing with production keys.

## Disclosure

We aim to respond to security reports as soon as possible. Please avoid public disclosure of sensitive technical details until the issue is reviewed.
