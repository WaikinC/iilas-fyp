# IILAS role-testing accounts — 3 November 2026

Website: [IILAS](https://fyp-inventory-and-logistics.web.app/). The user approved using six Gmail aliases and retaining the existing Admin/Manager. All six new accounts completed normal email verification, were approved through the existing Admin command, and passed separate email/password login and own-profile role checks. No verification flags were fabricated and no IAM permissions or billing settings changed.

| Role | IILAS login email | Current state | Main access test |
|---|---|---|---|
| Admin | choongkin6@gmail.com | Existing account retained | Account administration and authorised shared workflows |
| Manager | wakkin666@gmail.com | Existing account retained | Independent operational reviews/approvals; self-approval remains prohibited |
| Inventory | choongkin6+iilas-inventory@gmail.com | Verified, Approved, active | Permitted catalogue, stock and purchasing actions |
| Warehouse | choongkin6+iilas-warehouse@gmail.com | Verified, Approved, active | Permitted stock/warehouse picking, packing and handover |
| Logistics | choongkin6+iilas-logistics@gmail.com | Verified, Approved, active | Permitted shipment, dispatch, fleet, transport and delivery actions |
| Driver | choongkin6+iilas-driver@gmail.com | Verified, Approved, active | Assigned-delivery actions only; a matching driver resource/assignment is still required |
| Viewer | choongkin6+iilas-viewer@gmail.com | Verified, Approved, active | Permitted staff reads; write actions unavailable/refused |
| Customer | choongkin6+iilas-customer@gmail.com | Verified, Approved, active | Customer portal for explicitly granted shipments only |

## Find the passwords privately

On **MSI**, open **File Explorer → Downloads → IILAS-PRIVATE-TEST-ACCOUNTS → IILAS-ROLE-TEST-ACCOUNTS.txt**. It lists each new account's generated password and account ID. The private source and Downloads folder allow only the current Windows user and SYSTEM. The six passwords are different and have not been displayed in chat or committed/uploaded to GitHub. Existing Admin/Manager passwords were not changed or copied into the sheet.

These are IILAS logins. All six aliases receive email in the same existing `choongkin6@gmail.com` mailbox. They are separate demo identities, not six separate Gmail inboxes or six independent human reviewers. Keep the password sheet out of screenshots, reports, screen sharing and GitHub.

## Test without replacing the Admin session

1. Keep Admin open in its current browser profile. Use another profile/browser for the role being tested; ordinary tabs in one profile share a sign-in session.
2. Open IILAS, enter the role's full alias and its password from the private sheet. Confirm the displayed account/role before acting.
3. Follow the [module-by-module testing guide](SUPERVISOR_MODULE_TEST_GUIDE_2026-11-03.md). Use fictional records and expect actions outside that role's authority to be unavailable/refused.
4. For independent reviews, submit as one account and approve as the already separate Manager. A role name alone never permits self-approval.
5. Driver: register/link the new approved Driver account ID in Fleet Management and assign an agreed fictional shipment before testing its restricted delivery actions. Do not duplicate an existing driver's resource or alter unrelated assignments. An empty assignment list before setup is expected.
6. Customer: explicitly grant only an agreed fictional shipment through its existing access controls before expecting it in the portal. A recipient name/email does not grant access. Keep location sharing off for this session. An empty portal before a grant is expected.
7. Sign out of the test profile when finished. Keep the initial Admin and existing Manager roles intact.

The account checks verified login, real email-verification state and correct Approved role. They did not perform every role's full UI workflow, create Driver assignments or Customer grants, or run phone/parcel tests. Those remain explicit steps in the manual session.
