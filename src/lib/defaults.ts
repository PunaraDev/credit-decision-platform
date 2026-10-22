import type { Application, DocItem, Product } from '@/types'

const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()

export const DOC_TEMPLATE: Omit<DocItem, 'status' | 'version'>[] = [
  { key: 'nic', label: 'NIC / passport and address proof', check: 'Identity and address consistency', mandatory: true },
  { key: 'income', label: 'Income proof and bank statements', check: 'Income and transaction verification', mandatory: true },
  { key: 'crib', label: 'CRIB report reference', check: 'Authorized inquiry and validity', mandatory: true },
  { key: 'cr', label: 'Vehicle registration / ownership (CR)', check: 'Registration and collateral identity match', mandatory: true },
  { key: 'valuation', label: 'Valuation report and photos', check: 'Approved valuer, QA and asset evidence', mandatory: true },
  { key: 'invoice', label: 'Supplier invoice / quotation', check: 'Amount, seller and vehicle match', mandatory: true },
  { key: 'agreement', label: 'Facility agreement', check: 'Correct terms, version and signatures', mandatory: true },
  { key: 'insurance', label: 'Insurance cover note', check: 'Product-specific completeness', mandatory: true },
  { key: 'guarantor', label: 'Guarantor evidence', check: 'Conditional verification', mandatory: false },
]

/** Shape the UI expects before the server has data for a section. */
export function blankApplication(product: Product, seq = 0): Application {
  return {
    id: uid(), reference: `APP-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`, product,
    status: 'Draft', createdAt: now(), currentStep: 1, completed: [],
    consent: { privacyNotice: false, dataProcessing: false, cribInquiry: false, identityVerification: false, thirdPartySharing: false, channel: 'Branch' },
    customer: {
      customerType: 'Individual', fullName: '', initials: '', nic: '', dob: '', nationality: 'Sri Lankan', gender: '',
      mobile: '', email: '', address: '', district: '', province: '', language: 'English',
      maritalStatus: '', dependents: '0', residenceType: '', employmentStatus: '', employer: '', designation: '', yearsOfService: '',
      grossIncome: '', netIncome: '', monthlyExpenses: '', existingObligations: '0', bank: '', branch: '', accountNo: '',
      idFront: '', idBack: '', addressProof: '', incomeProof: '',
    },
    erp: { status: 'idle' }, crib: { status: 'idle' },
    screening: { status: 'idle', adjudication: '' },
    cdd: { sourceOfIncome: '', transactionPurpose: '', expectedMonthlyActivity: '', riskClass: '', notes: '' },
    fourN: { status: 'idle' }, submission: { submitted: false },
    collateral: {
      vehicleNo: '', engineNo: '', chassisNo: '', firstRegistration: '', vehicleCategory: '', usage: 'Private', engineCapacity: '',
      assetType: 'Motor Car', condition: 'Registered', make: '', model: '', yom: '', fuel: 'Petrol', transmission: 'Automatic',
      owner: '', seller: '', insured: false, encumbrance: false, crAttached: false, photosAttached: false,
    },
    valuation: { status: 'idle', marketValue: 0, deduction: 0, forcedSaleValue: 0, mileage: '', defects: '' },
    qa: { status: 'pending', comment: '' },
    facility: {
      product, scheme: product === 'Vehicle Lease' ? 'Other Lease - Fixed - Individual' : 'Vehicle Loan - Fixed - Individual',
      sector: '', subSector: '', purpose: '', subPurpose: '', netFacility: '', tenor: '', downPayment: '0', capitalizedCharges: '0',
      lumpSum: '0', requestedRate: '', vat: 'No', guarantor: 'No', guarantorName: '', guarantorNic: '', repaymentFrequency: 'Monthly',
      jointClient: 'No', jointName: '', jointNic: '',
    },
    decision: null, approval: { status: 'pending', comment: '' }, rate: null, rateRequest: null,
    supplier: {
      supplierId: '', name: '', regNo: '', address: '', contact: '', bank: '', accountNo: '', accountName: '',
      invoiceNo: '', invoiceDate: '', purchasePrice: '', deliveryDate: '',
      duplicateInvoiceCheck: false, eligibilityCheck: false, beneficiaryVerified: false,
    },
    confirmation: { insurance: false, customerAccepted: false, acceptanceChannel: 'Branch', agreementVersion: 'v1.0', officerConfirmed: false },
    documents: DOC_TEMPLATE.map(d => ({ ...d, status: 'missing', version: 0 })),
    audit: [{ at: now(), actor: 'System', action: 'Application created' }],
  }
}

