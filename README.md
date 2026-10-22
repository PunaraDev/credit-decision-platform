# OriginIQ: AI Credit Decisioning Platform

Vehicle leasing and vehicle loan origination: a seven-stage sequential journey, role-based access, a rules-first decision engine
with risk-based pricing, real file handling and a full audit trail. React + TypeScript on the front; Django microservices and
PostgreSQL behind an nginx gateway. Product blueprint: `docs/architecture/AI_Credit_Decisioning_Complete_Blueprint.docx`.

## Architecture

```
Browser ──> nginx gateway ──auth_request──> identity-service (login, sessions, users)   :8004
                 │  (verified X-User-* headers injected; client values overwritten)
                 ├──> workflow-service   applications, stage gates, files, customer review link   :8001
                 │         ├──> decision-service      score, pricing, DSR/LTV, rental schedule     :8002
                 │         └──> integration-service   ERP, CRIB, screening, valuation adapters      :8003
                 └──> frontend (static)
PostgreSQL 16: one database per service (identity, workflow, decision, integration)
```

## Run it (Docker)

```bash
cp .env.example .env        # then change every secret in it
make up                     # = docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
open http://localhost:8080
```
Sign in as `admin` with `ADMIN_PASSWORD` from `.env`; you must set a new password at first sign-in.
With `SEED_DEMO_USERS=1` one sample user per role is also created (password `DEMO_USER_PASSWORD`; also forced to change):
`marketing`, `compliance`, `valuer`, `qa`, `creditofficer`, `approver`, `operations`, `customer`.
For real use, set `SEED_DEMO_USERS=0` and create people under **Administration > Users**.

## What each role does

| Role | Main work |
| --- | --- |
| Marketing Officer | Creates applications, captures KYC, requests CRIB/valuation, facility details, accepts the customer submission |
| Compliance Officer | Runs screening, adjudicates matches |
| Valuer / QA Officer | Valuation notes / approves, rejects or sends back valuations |
| Credit Officer / Credit Approver | Runs assessments / approves outside the auto-approval limit or on conditional and manual outcomes |
| Operations Officer | Supplier checks, maker-checker confirmation, document verification |
| Administrator | Users, policy view, security log, everything above |

## The journey

**Start screen** (modelled on your example): choose Individual and a product (Normal Lease, Vehicle Loan; Revolving and Rescheduling shown as coming soon),
record consent, enter the NIC, **Fetch client** (ERP prefills name, address, client code, district, province), then **Screen** (CRIB result in the yellow panel).

1. Consent and KYC, client info, CRIB reference
2. Screening, CDD, customer review link, customer submission, officer handoff
3. Collateral, **Get Market Value**, a **Confirm submission** dialog (OK accepts the valuation, Cancel discards it), then manual QA
4. Facility details, including joint client and guarantor, then **Continue with risk-based pricing**
5. **AI recommended rate** and **AI floor rate** with a Green / Amber / Red decision, the **WALR table** (Current Month and Last 30 Days, Branch and Zone, Overall / RG / UR),
   credit score, additional amount, net facility, **Rate accept** or **Special rate request** (a credit approver decides), reasons, approval and the rental schedule
6. Supplier details, supplier checks, customer acceptance, maker-checker confirmation
7. Document upload and verification

WALR is weighted by facility amount. RG = AI-recommended rates that were accepted; UR = special rates approved outside the AI recommendation (an interpretation of the example's columns; adjust in `workflow/services.py: walr`).
Branch and zone come from each user's profile (Administration > Users).

Stages unlock strictly in order. The server enforces order, roles and completion rules; editing an earlier stage invalidates later ones.

## Security built in

Passwords are hashed with PBKDF2-SHA256 with a 10+ character policy; lockout after 5 failures
(15 min); logins rate-limited at the gateway; sessions revocable (logout, role change, password reset or disable signs the user out immediately);
forced password change at first login; the gateway verifies every API call and injects identity headers; browsers cannot reach integration adapters;
uploads are type- and content-checked, size-limited and tenant-scoped; the customer review link is random, one-time, expiring and rate-limited;
audit events are append-only. Put TLS in front (reverse proxy or load balancer) before any real use.

## Customer review emails (Gmail)

When stage 1 is completed with **Save and continue**, the workflow creates a secure review link and emails it to the saved customer email address. Stage 2 shows the sending result and offers **Resend email with new link**. A resend revokes the previous link. SMS is not configured.

Set these values in the local `.env` file (do not commit credentials):

```dotenv
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=1
EMAIL_USE_SSL=0
EMAIL_HOST_USER=your-sender@gmail.com
EMAIL_HOST_PASSWORD=your-google-app-password
PUBLIC_BASE_URL=https://your-customer-accessible-website
```

Create the sender's [Google App Password](https://support.google.com/mail/answer/185833) after enabling 2-Step Verification; use that instead of the Gmail account password. `DEFAULT_FROM_EMAIL` can be omitted to use the sender address. `PUBLIC_BASE_URL` must point to this application's frontend and API gateway at an address customers can open. A localhost link will not work on their phones. Recreate the workflow container after changing settings:

```bash
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d --build workflow frontend
```

Email is sent after the link is committed. Missing addresses, missing configuration, or SMTP failures are recorded on the application and shown on stage 2 without preventing stage 1 from completing. The sending result means the mail server accepted the message; it does not confirm inbox delivery. Emails contain the application reference and link, without identity, income, CRIB, or screening data. If the process stops between committing and sending, use the resend button on stage 2.

## Tests

```bash
make test                   # 35 backend tests (identity, workflow, decision, integration)
make e2e                    # drives a running stack through the gateway: logins, all 7 stages, uploads, public link, security checks
cd frontend && npm run build
```

## Honest status and what you still must do

| Area | Status |
| --- | --- |
| UI, API wiring, login/logout, work queues, administration, uploads, audit | Working against the real services |
| Customer review link | Built in (replaces the simulated 4N response). A third-party 4N service would replace it behind the same endpoint |
| CRIB, ERP, screening, valuation | **Sandbox adapters** return simulated data (a banner shows this). Set `INTEGRATION_MODE=live` and `<NAME>_BASE_URL` / `<NAME>_API_KEY` for ERP, CRIB, SCREENING, VALUATION to call real providers; they must return the same JSON shapes as the sandbox. Provider access must be authorized by each provider/lender |
| Decision policy | **Illustrative numbers**. Replace `decision-service/decision/policy.py` with the approved credit policy |
| AI model | Rules-first scorecard. A statistical model needs permitted historical data and independent validation first |
| Files | Stored on a volume (`uploads`). Add virus scanning and object storage for production |
| Operations | Add TLS, backups for PostgreSQL and uploads, monitoring, and a data-retention policy per your regulator |
