# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | Yes                |
| 0.1.x   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in Beacon, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email: **security@sachshaus.net**

You should receive a response within 48 hours. We'll work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Considerations

- **PIN authentication** is designed for family convenience (kids), not enterprise security. PINs are stored locally and are not transmitted over the network.
- **All data stays local** — Beacon communicates only with your Home Assistant instance on your local network.
- **No cloud services** — no data is sent to external servers.
- **HA tokens** are stored in environment variables or the add-on configuration, never in the frontend bundle.
- **WebSocket connections** to Home Assistant use the same authentication as the HA frontend.

## Best Practices

- Keep your Home Assistant instance updated
- Use HTTPS for your HA instance if exposing externally
- Rotate your long-lived access tokens periodically
- Restrict network access to the Beacon add-on if not needed externally
