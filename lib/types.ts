// ── Domain types mirroring the Supabase schema (see backend/migrations) ──────

export type ProjectStatus =
  | 'planning'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface Project {
  id: string;
  project_code?: string | null;
  customer_name: string;
  mobile?: string | null;
  alt_mobile?: string | null;
  email?: string | null;
  aadhar_number?: string | null;
  pan_number?: string | null;
  electricity_bill_id?: string | null;
  location?: string | null;
  installation_address?: string | null;
  village?: string | null;
  taluka?: string | null;
  district?: string | null;
  pincode?: string | null;
  longitude_latitude?: string | null;
  execution_partner?: string | null;
  epc_name?: string | null;
  system_size_kwp?: number | null;
  connection_type?: string | null;
  discom?: string | null;
  project_status: ProjectStatus | string;
  payment_mode?: string | null;
  total_cost?: number | null;
  amount_paid?: number | null;
  advance_amount?: number | null;
  subsidy_amount?: number | null;
  subsidy_status?: string | null;
  subsidy_applied_date?: string | null;
  subsidy_disbursed_date?: string | null;
  bank_name?: string | null;
  bank_loan_amount?: number | null;
  bank_quotation_amount?: number | null;
  loan_status?: string | null;
  balance?: number | null;
  net_payable?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Installment {
  id: string;
  project_id: string;
  installment_no?: number | null;
  amount?: number | null;
  due_date?: string | null;
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled' | string;
  payment_type?: string | null;
  created_at?: string | null;
}

export interface ProjectStep {
  id?: string;
  project_id: string;
  step_no: number;
  step_name: string;
  status: 'pending' | 'in_progress' | 'completed' | string;
  progress_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  doc_name: string;
  status: 'pending' | 'uploaded' | string;
  created_at?: string | null;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  note: string;
  next_action?: string | null;
  created_at?: string | null;
}

export interface ActivityLog {
  id?: string;
  user_email?: string | null;
  user_name?: string | null;
  user_picture?: string | null;
  action?: string | null;
  entity_type?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  details?: string | null;
  created_at?: string | null;
}

export type UserRole = 'admin' | 'employee';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface AppUser {
  id?: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  role: UserRole | string;
  status: UserStatus | string;
  employee_code?: string | null;
  created_at?: string | null;
}

export interface Epc {
  id: string;
  name: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  aadhar?: string | null;
  personal_amount?: number | null;
  gst_received?: number | null;
  created_at?: string | null;
}

export interface EpcTransaction {
  id: string;
  epc_id: string;
  customer_name?: string | null;
  purchase_material?: string | null;
  purchase_base?: number | null;
  purchase_gst_pct?: number | null;
  purchase_invoice_no?: string | null;
  sale_material?: string | null;
  sale_base?: number | null;
  sale_gst_pct?: number | null;
  sale_invoice_no?: string | null;
  sale_item_id?: string | null;
  sale_quantity?: number | null;
  created_at?: string | null;
}

export interface EpcProjectFee {
  id: string;
  epc_id: string;
  customer_name?: string | null;
  fee_date?: string | null;
  amount?: number | null;
  created_at?: string | null;
}

// ── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  unit_cost?: number | null;
  reorder_level?: number | null;
  created_at?: string | null;
}

export type MovementType = 'in' | 'out';

export interface InventoryMovement {
  id: string;
  item_id: string;
  type: MovementType | string;
  quantity?: number | null;
  unit_price?: number | null;
  base_amount?: number | null;
  gst_pct?: number | null;
  expense?: number | null;
  source?: string | null;
  source_ref?: string | null;
  party?: string | null;
  reference?: string | null;
  note?: string | null;
  movement_date?: string | null;
  created_at?: string | null;
}

export interface InventoryExpense {
  id: string;
  category?: string | null;
  description?: string | null;
  amount?: number | null;
  tax?: number | null;
  expense_date?: string | null;
  source?: string | null;
  source_ref?: string | null;
  created_at?: string | null;
}

/** An item plus its computed live stock figures. */
export interface InventoryItemStock extends InventoryItem {
  qtyIn: number;
  qtyOut: number;
  qty: number;          // remaining = in − out
  stockValue: number;   // qty × unit_cost
  low: boolean;         // qty <= reorder_level
}
