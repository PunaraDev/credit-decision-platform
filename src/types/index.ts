export type Role =
  | 'Customer' | 'Marketing Officer' | 'Compliance Officer' | 'Valuer' | 'QA Officer'
  | 'Credit Officer' | 'Credit Approver' | 'Operations Officer' | 'Administrator'

export type Product = 'Vehicle Lease' | 'Vehicle Loan'
export type AppStatus = 'Draft' | 'In Progress' | 'Pending External Response' | 'Pending Manual Review' | 'Changes Requested' | 'Approved' | 'Declined' | 'Completed'

export interface Consent {
  privacyNotice: boolean; dataProcessing: boolean; cribInquiry: boolean; identityVerification: boolean; thirdPartySharing: boolean
  channel: 'Branch' | 'Digital' | 'Phone'; capturedAt?: string
  /** Written only by the server when the customer submits the review link. Staff cannot set these. */
  screeningCheck?: boolean; customerConsentAt?: string; customerConsentBy?: string
}
export interface Customer {
  customerType: 'Individual' | 'Business'
  fullName: string; initials: string; nic: string; dob: string; nationality: string; gender: string
  mobile: string; email: string; address: string; district: string; province: string; language: string
  maritalStatus: string; dependents: string; residenceType: string
  employmentStatus: string; employer: string; designation: string; yearsOfService: string
  grossIncome: string; netIncome: string; monthlyExpenses: string; existingObligations: string
  bank: string; branch: string; accountNo: string
  idFront: string; idBack: string; addressProof: string; incomeProof: string
  idFrontFileId?: string; idBackFileId?: string; addressProofFileId?: string; incomeProofFileId?: string
}
export interface ErpLink { status: 'idle' | 'searching' | 'found' | 'new'; customerId?: string; clientCode?: string; existingFacilities?: number }
export interface CribRecord {
  status: 'idle' | 'pending' | 'HIT' | 'NO_HIT'; helpId?: string; commitment?: number; score?: number
  arrears?: boolean; requestedAt?: string; reportDate?: string
}
export interface Screening {
  status: 'idle' | 'running' | 'clear' | 'review'
  sanctions?: 'clear' | 'match'; pep?: 'clear' | 'match'; adverseMedia?: 'clear' | 'match'; internalWatchlist?: 'clear' | 'match'
  adjudication: string; ranAt?: string
}
export interface Cdd {
  sourceOfIncome: string; transactionPurpose: string; expectedMonthlyActivity: string
  riskClass: 'Low' | 'Medium' | 'High' | ''; notes: string
}
export interface ReviewEmailDelivery {
  status: 'pending' | 'sent' | 'failed' | 'not_configured' | 'missing_email' | 'invalid_email' | 'invalid_link'
  recipient?: string; attemptedAt?: string; sentAt?: string; message?: string
}
export interface ReviewSmsDelivery {
  status: 'pending' | 'sent' | 'simulated' | 'failed' | 'not_configured' | 'missing_mobile' | 'invalid_mobile' | 'invalid_link'
  recipient?: string; attemptedAt?: string; sentAt?: string; message?: string
}
export interface FourN { status: 'idle' | 'sent' | 'submitted'; correlationId?: string; link?: string; sentAt?: string; expiresAt?: string; confirmedAt?: string; confirmedBy?: string; emailDelivery?: ReviewEmailDelivery; smsDelivery?: ReviewSmsDelivery }
export interface Submission { submitted: boolean; submittedAt?: string; snapshotId?: string }

export interface Collateral {
  vehicleNo: string; engineNo: string; chassisNo: string; firstRegistration: string
  vehicleCategory: string; usage: string; engineCapacity: string; assetType: string; condition: string
  make: string; model: string; yom: string; fuel: string; transmission: string
  owner: string; seller: string; insured: boolean; encumbrance: boolean; crAttached: boolean; photosAttached: boolean
  crFile?: string; crFileId?: string; photosFile?: string; photosFileId?: string
}
export interface Valuation {
  status: 'idle' | 'requested' | 'reported'; valuer?: string; reference?: string; reportDate?: string
  marketValue: number; deduction: number; forcedSaleValue: number; mileage: string; defects: string
  officerDecision?: 'accepted' | null
}
export interface Qa { status: 'pending' | 'approved' | 'rejected' | 'revaluation'; reviewer?: string; comment: string; reviewedAt?: string }

export interface Facility {
  product: Product; scheme: string; sector: string; subSector: string; purpose: string; subPurpose: string
  netFacility: string; tenor: string; downPayment: string; capitalizedCharges: string; lumpSum: string
  requestedRate: string; vat: 'Yes' | 'No'; guarantor: 'Yes' | 'No'; guarantorName: string; guarantorNic: string
  repaymentFrequency: string
  jointClient: 'Yes' | 'No'; jointName: string; jointNic: string
}

export type DecisionOutcome = 'Approve' | 'Conditional approve' | 'Manual review' | 'Decline' | 'Compliance hold'
export interface Factor { label: string; impact: number; note: string }
export interface Decision {
  runAt: string; modelVersion: string; score: number; outcome: DecisionOutcome
  approvedRate: number; floorRate: number; requestedRate: number
  ltv: number; dsr: number; installment: number; totalPayable: number; financed: number
  factors: Factor[]; conditions: string[]; hardStops: string[]; needsApprover: boolean
  trafficLight: 'Green' | 'Amber' | 'Red'; additionalAmount: number
}
export interface Rate { mode: 'ai' | 'special'; rate: number; installment: number; totalPayable: number; at?: string }
export interface RateRequest { status: 'pending' | 'approved' | 'rejected'; rate: number; comment: string; decisionNote?: string }
export interface Approval { status: 'pending' | 'approved' | 'rejected'; by?: string; at?: string; comment: string }

export interface Supplier {
  supplierId: string; name: string; regNo: string; address: string; contact: string
  bank: string; accountNo: string; accountName: string
  invoiceNo: string; invoiceDate: string; purchasePrice: string; deliveryDate: string
  duplicateInvoiceCheck: boolean; eligibilityCheck: boolean; beneficiaryVerified: boolean
}
export interface Confirmation {
  insurance: boolean; customerAccepted: boolean; acceptanceChannel: string; acceptedAt?: string
  agreementVersion: string; officerConfirmed: boolean; officerAt?: string
}
export type DocStatus = 'missing' | 'uploaded' | 'verified' | 'rejected'
export interface DocItem {
  key: string; label: string; check: string; mandatory: boolean; status: DocStatus
  fileName?: string; fileId?: string; version: number; reviewer?: string; reason?: string
}
export interface AuditEvent { at: string; actor: string; action: string; detail?: string }

export interface Application {
  id: string; reference: string; product: Product; status: AppStatus; createdAt: string
  currentStep: number; completed: number[]
  consent: Consent; customer: Customer; erp: ErpLink; crib: CribRecord
  screening: Screening; cdd: Cdd; fourN: FourN; submission: Submission
  collateral: Collateral; valuation: Valuation; qa: Qa
  facility: Facility; decision: Decision | null; approval: Approval; rate: Rate | null; rateRequest: RateRequest | null
  supplier: Supplier; confirmation: Confirmation
  documents: DocItem[]; audit: AuditEvent[]
}

export const STEPS = [
  { n: 1, title: 'Consent & KYC', sub: 'Customer details' },
  { n: 2, title: 'Screening & CRIB', sub: 'CDD and 4N' },
  { n: 3, title: 'Collateral', sub: 'Valuation and QA' },
  { n: 4, title: 'Facility', sub: 'Facility details' },
  { n: 5, title: 'AI decision', sub: 'Rate and rentals' },
  { n: 6, title: 'Supplier', sub: 'Facility confirmation' },
  { n: 7, title: 'Documents', sub: 'Collect and verify' },
] as const

export interface Summary {
  customerName: string; nic: string; mobile: string; district: string
  erp?: string; erpCustomerId?: string; cribStatus?: string; cribScore?: number; cribCommitment?: number
  screening?: string; riskClass?: string; fourN?: string
  vehicle: string; vehicleNo: string; valuation?: string; marketValue?: number; qa?: string
  netFacility: number; tenor?: string; product: string
  outcome?: string; trafficLight?: string; finalRate?: number; rateRequest?: string; score?: number; approvedRate?: number; installment?: number; approval?: string
  docsVerified: number; docsRequired: number; docsPending: number
}
export interface AppRow {
  id: string; reference: string; product: Product; status: AppStatus; currentStep: number; completed: number[]
  version: number; assignedTo: string; createdAt: string; updatedAt: string; summary: Summary
}
export interface ServerApplication {
  id: string; reference: string; product: Product; status: AppStatus; currentStep: number; completed: number[]
  stages: Record<string, Record<string, unknown>>; version: number; createdAt: string
}
