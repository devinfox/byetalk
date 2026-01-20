-- Invoices table for saving and managing invoices
-- Only accessible by specific users (John Carrington, Shaun Bina)

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invoice metadata
  invoice_number TEXT,
  client_name TEXT,
  client_address TEXT,
  client_city_state_zip TEXT,
  client_phone TEXT,
  date TEXT,

  -- Line items stored as JSONB array
  -- Each item: { description, qty, listPrice, total }
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Calculated total
  grand_total DECIMAL(12, 2) DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'sent'))
);

-- Index for faster lookups by creator
CREATE INDEX idx_invoices_created_by ON invoices(created_by);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);

-- Update trigger for updated_at
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own invoices
-- Admin (admin@citadelgold.com) can view all invoices
CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.email = 'admin@citadelgold.com'
    )
  );

-- Policy: Users can insert their own invoices
CREATE POLICY invoices_insert_policy ON invoices
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own invoices
CREATE POLICY invoices_update_policy ON invoices
  FOR UPDATE
  USING (created_by = auth.uid());

-- Policy: Users can delete their own invoices
CREATE POLICY invoices_delete_policy ON invoices
  FOR DELETE
  USING (created_by = auth.uid());
