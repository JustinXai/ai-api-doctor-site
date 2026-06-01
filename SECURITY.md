# Security Policy

## Scope

This security policy covers:
- Browser-side diagnostic code in this repository
- Public site at https://aiapidoctor.com
- Cloudflare Pages Function `/api/public-signals`

## What this project does not handle

This project does not control, store, or transmit user API keys. All API requests are made directly from the user's browser to their self-specified Base URL.

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

## Security focus areas

When reviewing this project, special attention should be given to:

- **XSS in report rendering:** User-controlled data from API responses is rendered in the report HTML. All such data must be escaped.
- **API key leakage:** The browser makes direct requests; keys must never leave the browser or be logged.
- **Unsafe parse-and-fill behavior:** The JSON/ENV/curl parser should reject malformed input gracefully.
- **Public-signal Worker abuse:** The Worker endpoint should rate-limit and not expose sensitive data.
- **Dependency/script supply-chain risk:** External CDN scripts (e.g., html-to-image) should be pinned to specific versions.
- **Source code leakage into UI:** Internal scoring logic, function names, or code comments must not appear in user-visible report text.
- **Scoring and report tampering:** Scores are computed client-side; the report is for informational display only.

## Recommended user practice

- Use a temporary test key.
- Set low quota or spending limits if your provider supports it.
- Rotate the key after testing if needed.
- Check provider billing / balance after running tests.
- Avoid testing with production keys.

## Disclosure

We aim to respond to security reports as soon as possible. Please avoid public disclosure of sensitive technical details until the issue is reviewed.
