# IT Security, Hardware Provisioning & Remote Access Guide

## Hardware Standard Issue
All technical staff and new joiners are issued corporate-managed hardware:
- **Engineering / Product Roles:** 16-inch Apple MacBook Pro (Apple M3 Max, 36GB Unified Memory, 1TB SSD) or Lenovo ThinkPad X1 Carbon Gen 12 (Intel Core Ultra 7, 32GB RAM).
- **Business / HR / Operations Roles:** 14-inch Apple MacBook Air M3 or Microsoft Surface Laptop 6 with 16GB RAM.
- **Accessories:** Shipped alongside your machine: CalDigit USB-C Docking Station, dual monitor display cables, Jabra Evolve2 noise-canceling headset, and YubiKey 5C NFC hardware security key.

## Device Enrollment & Microsoft Intune
Before accessing any Launch Mate services, you must enroll your device in Microsoft Intune Mobile Device Management (MDM):
1. Power on your laptop and connect to your home Wi-Fi.
2. Sign in with your Launch Mate corporate email (`username@launchmate.com`) and temporary password provided in your welcome email.
3. Follow the Intune Company Portal prompts to enable FileVault / BitLocker disk encryption and CrowdStrike Falcon endpoint security.
4. Intune enrollment must be completed within 48 hours of laptop delivery.

## Multi-Factor Authentication (MFA) Setup
- **Microsoft Authenticator:** Mandatory MFA mechanism for all single sign-on (SSO) logins via Microsoft Entra ID.
- **Configuration:** Download the Microsoft Authenticator app on your iOS or Android smartphone. Navigate to `https://aka.ms/mfasetup` on your laptop, scan the QR code with your phone, and approve the two-digit number matching prompt.
- **Hardware Token (YubiKey):** If you work in infrastructure, cybersecurity, or have access to production Azure subscriptions, registering your provided YubiKey as a FIDO2 WebAuthn security key is mandatory.

## Corporate VPN & Network Access
- **Azure Virtual WAN & GlobalProtect:** Launch Mate uses Zero-Trust Network Access (ZTNA). For routine tools (Microsoft 365, Teams, Jira, Workday), no VPN is required.
- **Production & Staging Environments:** Connecting to internal Azure Kubernetes Service (AKS) clusters or production SQL databases requires connecting via the GlobalProtect VPN client with MFA authentication.
- **Split Tunneling:** VPN traffic uses split tunneling; your personal web browsing is not routed through corporate gateways.

## GitHub Enterprise & Development Access
- **SSO Organization:** Go to `https://github.com/launchmate-org` and authenticate with your Entra ID credentials.
- **SSH Keys:** Launch Mate only permits Ed25519 SSH keys. RSA-2048 keys are prohibited.
- **Signed Commits:** All git commits to production repositories must be cryptographically signed using GPG or your SSH key (`git config --global commit.gpgsign true`).

## IT Helpdesk & Support Channels
- **Slack Support Channel:** `#it-helpdesk` (Monitored 24/7 with a 15-minute response SLA for onboarding blockers).
- **Self-Service Ticket Portal:** `https://helpdesk.launchmate.com`
- **Emergency Hardware Hotline:** 1-800-LAUNCHMATE-IT
