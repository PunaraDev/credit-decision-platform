import { z } from 'zod'
import { num } from './finance'

/** Input-range hints only. The decision service holds the authoritative policy and re-checks every value. */
const POLICY = { minTenor: 6, maxTenor: 84, maxRate: 28 }

export const PROVINCE_OF: Record<string, string> = {
  Colombo: 'Western Province', Gampaha: 'Western Province', Kalutara: 'Western Province',
  Kandy: 'Central Province', Galle: 'Southern Province', Matara: 'Southern Province',
  Jaffna: 'Northern Province', Batticaloa: 'Eastern Province', Trincomalee: 'Eastern Province',
  Kurunegala: 'North Western Province', Anuradhapura: 'North Central Province',
  Badulla: 'Uva Province', Ratnapura: 'Sabaragamuwa Province',
}

export const customerSchema = z.object({
  fullName: z.string().min(3, 'Enter the full legal name'),
  initials: z.string().min(1, 'Enter initials'),
  nic: z.string().regex(/^(\d{9}[VvXx]|\d{12})$/, 'Enter a valid NIC (9 digits + V/X, or 12 digits)'),
  dob: z.string().min(1, 'Select date of birth'),
  gender: z.string().min(1, 'Select gender'),
  mobile: z.string().regex(/^0\d{9}$/, 'Enter a 10-digit mobile number starting with 0'),
  email: z.string().email('Enter a valid email').or(z.literal('')),
  address: z.string().min(5, 'Enter the residential address'),
  district: z.string().min(1, 'Select district'),
  province: z.string().min(1, 'Select province'),
  maritalStatus: z.string().min(1, 'Select marital status'),
  residenceType: z.string().min(1, 'Select residence type'),
  employmentStatus: z.string().min(1, 'Select employment status'),
  employer: z.string().min(2, 'Enter employer'),
  yearsOfService: z.string().min(1, 'Enter years of service'),
  netIncome: z.string().refine(v => num(v) > 0, 'Enter verified monthly net income'),
  monthlyExpenses: z.string().min(1, 'Enter monthly expenses'),
  bank: z.string().min(1, 'Select bank'),
  accountNo: z.string().min(6, 'Enter account number'),
  idFront: z.string().min(1, 'Attach NIC front'),
  idBack: z.string().min(1, 'Attach NIC back'),
  addressProof: z.string().min(1, 'Attach address proof'),
  incomeProof: z.string().min(1, 'Attach income proof'),
})

export const facilitySchema = z.object({
  sector: z.string().min(1, 'Select customer sector'),
  subSector: z.string().min(1, 'Select sub sector'),
  purpose: z.string().min(1, 'Select facility purpose'),
  subPurpose: z.string().min(1, 'Select facility sub purpose'),
  netFacility: z.string().refine(v => num(v) >= 100_000, 'Net facility must be at least LKR 100,000'),
  tenor: z.string().refine(v => num(v) >= POLICY.minTenor && num(v) <= POLICY.maxTenor, `Tenor must be ${POLICY.minTenor}-${POLICY.maxTenor} months`),
  requestedRate: z.string().refine(v => num(v) > 0 && num(v) <= POLICY.maxRate, `Enter a rate up to ${POLICY.maxRate}%`),
})

export const supplierSchema = z.object({
  supplierId: z.string().min(1, 'Enter supplier ID'), name: z.string().min(2, 'Enter registered name'),
  regNo: z.string().min(1, 'Enter registration number'), address: z.string().min(5, 'Enter address'), contact: z.string().min(7, 'Enter contact number'),
  bank: z.string().min(1, 'Select bank'), accountNo: z.string().min(6, 'Enter account number'), accountName: z.string().min(2, 'Enter account holder name'),
  invoiceNo: z.string().min(1, 'Enter invoice number'), invoiceDate: z.string().min(1, 'Select invoice date'),
  purchasePrice: z.string().refine(v => num(v) > 0, 'Enter purchase price'), deliveryDate: z.string().min(1, 'Select delivery date'),
})

export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): Record<string, string> {
  const r = schema.safeParse(data)
  if (r.success) return {}
  const out: Record<string, string> = {}
  for (const i of r.error.issues) out[String(i.path[0])] = out[String(i.path[0])] ?? i.message
  return out
}

export const LISTS = {
  districts: ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Galle', 'Matara', 'Jaffna', 'Batticaloa', 'Trincomalee', 'Kurunegala', 'Anuradhapura', 'Badulla', 'Ratnapura'],
  provinces: ['Western Province', 'Central Province', 'Southern Province', 'Northern Province', 'Eastern Province', 'North Western Province', 'North Central Province', 'Uva Province', 'Sabaragamuwa Province'],
  banks: ['Bank of Ceylon', "People's Bank", 'Commercial Bank', 'Sampath Bank', 'Hatton National Bank', 'Nations Trust Bank', 'DFCC Bank', 'Seylan Bank'],
  employment: ['Employed', 'Self-employed', 'Business owner', 'Professional', 'Retired'],
  residence: ['Owned', 'Rented', 'With Parents/Spouse', 'Company provided'],
  marital: ['Single', 'Married', 'Divorced', 'Widowed'],
  sectors: ['TOURISM', 'AGRICULTURE', 'MANUFACTURING', 'TRADE AND SERVICES', 'TRANSPORT', 'CONSTRUCTION', 'SALARIED EMPLOYMENT'],
  subSectors: ['Other tourism related activities', 'Hotels and restaurants', 'Travel agencies', 'Wholesale trade', 'Retail trade', 'Road transport'],
  purposes: ['HEALTH CARE, SOCIAL SERVICES AND SUPPORT SERVICES', 'TRANSPORT AND LOGISTICS', 'PERSONAL USE', 'TRADE AND COMMERCE', 'AGRICULTURE SUPPORT'],
  subPurposes: ['Private security and investigation activities', 'Passenger transport', 'Goods delivery', 'Personal mobility', 'Field operations'],
  makes: ['SUZUKI', 'TOYOTA', 'HONDA', 'NISSAN', 'MITSUBISHI', 'MICRO', 'BAJAJ'],
  categories: ['Auto', 'Hybrid', 'Electric', 'Commercial', 'Motor Cycle'],
}
