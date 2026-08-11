# Security Policy

## Supported versions

Security updates are applied to the latest published LocalDrop release and the default branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's **Report a vulnerability** option in the repository's Security tab to submit a private report with:

- A clear description of the issue and its potential impact
- Steps or a minimal proof of concept to reproduce it
- The affected operating system, browser, and LocalDrop version
- Any suggested mitigation, if available

Please allow reasonable time for investigation and a coordinated fix before public disclosure.

## Deployment guidance

LocalDrop is intended for trusted private networks. Do not expose its port through router forwarding, DMZ configuration, a public reverse proxy, or a public tunnel. Pair only with devices you trust, rotate the PIN when changing phones, and keep the host operating system and browser up to date.
