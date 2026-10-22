# API contract (v1)

All calls go through the gateway under `/api/v1` with `Authorization: Bearer <token>` unless marked public. The gateway verifies the token with
identity-service and injects `X-User-Id`, `X-User-Role`, `X-Tenant-Id` (client-supplied values are overwritten). Optional: `Idempotency-Key`.

Errors: `{ "error": { "code", "message", "details": [], "correlationId" } }`. Gate failures **422** (failed checks in `details`); locked stage **409** `stage_locked`;
wrong role **403**; no/expired session **401**; password change pending **403** `password_change_required`; throttled **503/429** at the gateway.

## identity-service
| Method | Path | Notes |
| --- | --- | --- |
| POST | /auth/login | Public, rate-limited. `{username, password}` -> `{accessToken, expiresAt, user}`; 423 when locked |
| POST | /auth/logout | Revokes the session immediately |
| GET | /auth/me | Current user |
| POST | /auth/change-password | `{current, new}`; signs out other devices |
| GET, POST | /auth/users | Administrator only |
| PATCH | /auth/users/{id} | role, fullName, email, isActive, unlock, password (revokes sessions) |
| GET | /auth/security-log | Administrator only |

## workflow-service
| Method | Path | Purpose |
| --- | --- | --- |
| POST | /applications | Create `{product}` (idempotent) |
| GET | /applications, /applications/{id} | List with summaries / full read. Customer-role users see only their own |
| PATCH | /applications/{id}/onboarding | Stage 1: `consent`, `customer` |
| POST | /applications/{id}/screening | Stage 2: `cdd` |
| POST | /applications/{id}/valuations | Stage 3: `collateral`, valuation notes |
| PATCH | /applications/{id}/facility | Stage 4: `facility` |
| POST | /applications/{id}/assessments | Stage 5: calls decision-service; auto-approves inside the delegated limit |
| GET | /applications/{id}/pricing | AI rate, floor, instalment |
| GET | /applications/{id}/walr | Weighted average lending rates by period and level (branch, zone), split Overall / RG / UR |
| POST | /applications/{id}/confirmations | Stage 6: `supplier`, `confirmation` (insurance, channel) |
| POST | /applications/{id}/documents | Stage 7: `{action: upload/verify/reject, key, fileName, fileId, reason}` |
| POST | /applications/{id}/files | Multipart `file` + `label`. PDF/JPG/PNG/ZIP, 10 MB, content signature checked |
| GET | /files/{fileId} | Download (tenant-scoped) |
| POST | /applications/{id}/integrations/{erp,crib,screening,fourn,valuation} | Server-side adapter call; writes system-owned fields. `fourn` creates the customer review link |
| POST | /applications/{id}/transitions | `advance`, `submit`, `accept`, `valuation_accept`, `valuation_reject`, `rate_accept`, `special_rate_request` (`rate`, `comment`), `adjudicate_screening`, `qa_approve`, `qa_reject`, `qa_revaluation`, `approve`, `reject`, `run_supplier_checks`, `customer_accept`, `officer_confirm` |
| GET | /applications/{id}/timeline | Immutable audit events |
| GET, POST | /public/review/{token} | **Public**, rate-limited. Customer views masked details and confirms once |

Clients cannot write system-owned fields (`erp`, `crib`, `screening`, `fourN`, valuation figures, `qa`, `decision`, `approval`, supplier checks).

## decision-service
`POST /decisions/assess`, `POST /decisions/schedule`, `GET /decisions/history/{applicationId}`, `GET /decisions/policy`

## integration-service (internal; only `GET /integrations/mode` is exposed to browsers)
`POST /integrations/erp/search`, `/crib/inquiry`, `/screening/run`, `/fourn/send`, `/valuation/request`. Logged and idempotent per `Idempotency-Key`.
