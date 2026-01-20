"use client";

import { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import styles from "./invoice.module.css";

type LineItem = {
  id: string;
  productName: string;
  qty: string;
  listPrice: string;
};

type InvoiceData = {
  date: string;
  clientName: string;
  acctNumber: string;
  accountType: string;
  email: string;
  phone: string;
  acctRep: string;
  acctRep2: string;
  salesInvoiceNo: string;
  billTo: string;
  shipTo: string;
  lineItems: LineItem[];
};

type PaymentOptions = {
  wire: boolean;
  overnightCheck: boolean;
  chargeEntrustAccount: boolean;
  thirdPartyBilling: boolean;
  fedex: boolean;
  ups: boolean;
  upsAccountNumber: string;
};

type SavedInvoice = {
  id: string;
  created_at: string;
  updated_at: string;
  invoice_number: string | null;
  client_name: string | null;
  client_address: string | null;
  client_city_state_zip: string | null;
  client_phone: string | null;
  date: string | null;
  line_items: LineItem[];
  grand_total: number;
  status: string;
  creator?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
};

const initialLineItem = (): LineItem => ({
  id: crypto.randomUUID(),
  productName: "",
  qty: "",
  listPrice: "",
});

// Calculate line item total from qty and price
const calculateLineTotal = (qty: string, listPrice: string): number => {
  const qtyNum = Number(qty) || 0;
  // Remove currency symbols and commas from price
  const cleanPrice = String(listPrice || "").replace(/[^0-9.]/g, "");
  const priceNum = Number(cleanPrice) || 0;
  return qtyNum * priceNum;
};

// Format currency
const formatCurrency = (amount: number): string => {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
};

const initialInvoiceData: InvoiceData = {
  date: new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }),
  clientName: "",
  acctNumber: "",
  accountType: "",
  email: "",
  phone: "",
  acctRep: "",
  acctRep2: "",
  salesInvoiceNo: "",
  billTo: "",
  shipTo: "",
  lineItems: [initialLineItem()],
};

const initialPaymentOptions: PaymentOptions = {
  wire: false,
  overnightCheck: false,
  chargeEntrustAccount: false,
  thirdPartyBilling: false,
  fedex: false,
  ups: false,
  upsAccountNumber: "",
};

export default function InvoicePage() {
  const [invoiceData, setInvoiceData] = useState<InvoiceData>(initialInvoiceData);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSavedPanel, setShowSavedPanel] = useState(true);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions>(initialPaymentOptions);
  const [isGeneratingBuyDirection, setIsGeneratingBuyDirection] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const buyDirectionRef = useRef<HTMLDivElement>(null);

  // Fetch saved invoices on mount
  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await fetch("/api/invoices");
      if (response.ok) {
        const data = await response.json();
        setSavedInvoices(data.invoices || []);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof InvoiceData, value: string) => {
    setInvoiceData((prev) => ({ ...prev, [field]: value }));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setInvoiceData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addRow = () => {
    setInvoiceData((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, initialLineItem()],
    }));
  };

  const removeRow = (id: string) => {
    if (invoiceData.lineItems.length > 1) {
      setInvoiceData((prev) => ({
        ...prev,
        lineItems: prev.lineItems.filter((item) => item.id !== id),
      }));
    }
  };

  const calculateGrandTotal = (): number => {
    return invoiceData.lineItems.reduce((sum, item) => {
      return sum + calculateLineTotal(item.qty, item.listPrice);
    }, 0);
  };

  const saveInvoice = async () => {
    setIsSaving(true);
    try {
      const payload = {
        invoice_number: invoiceData.salesInvoiceNo,
        client_name: invoiceData.clientName,
        client_address: invoiceData.billTo,
        client_city_state_zip: "",
        client_phone: "",
        date: invoiceData.date,
        line_items: invoiceData.lineItems.map(item => ({
          id: item.id,
          productName: item.productName,
          qty: item.qty,
          listPrice: item.listPrice,
        })),
        grand_total: calculateGrandTotal(),
        status: "draft",
      };

      let response;
      if (currentInvoiceId) {
        // Update existing invoice
        response = await fetch(`/api/invoices/${currentInvoiceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new invoice
        response = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        const data = await response.json();
        setCurrentInvoiceId(data.invoice.id);
        await fetchInvoices();
        alert("Invoice saved successfully!");
      } else {
        const error = await response.json();
        alert(`Error saving invoice: ${error.error}`);
      }
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert("Error saving invoice. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadInvoice = (invoice: SavedInvoice) => {
    setCurrentInvoiceId(invoice.id);
    setInvoiceData({
      date: invoice.date || initialInvoiceData.date,
      clientName: invoice.client_name || "",
      acctNumber: "",
      accountType: "",
      email: "",
      phone: "",
      acctRep: "",
      acctRep2: "",
      salesInvoiceNo: invoice.invoice_number || "",
      billTo: invoice.client_address || "",
      shipTo: "",
      lineItems: invoice.line_items?.length > 0
        ? invoice.line_items.map(item => ({
            id: item.id || crypto.randomUUID(),
            productName: item.productName || "",
            qty: item.qty || "",
            listPrice: item.listPrice || "",
          }))
        : [initialLineItem()],
    });
  };

  const updatePaymentOption = (field: keyof PaymentOptions, value: boolean | string) => {
    setPaymentOptions((prev) => ({ ...prev, [field]: value }));
  };

  const deleteInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;

    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        if (currentInvoiceId === invoiceId) {
          newInvoice();
        }
        await fetchInvoices();
      } else {
        const error = await response.json();
        alert(`Error deleting invoice: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting invoice:", error);
      alert("Error deleting invoice. Please try again.");
    }
  };

  const newInvoice = () => {
    setCurrentInvoiceId(null);
    setInvoiceData(initialInvoiceData);
  };

  const generatePDF = async () => {
    if (!invoiceRef.current) {
      console.error("Invoice ref not found");
      alert("Error: Invoice template not ready. Please try again.");
      return;
    }

    setIsGenerating(true);

    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        allowTaint: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`invoice-${invoiceData.salesInvoiceNo || "draft"}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateBuyDirectionLetter = async () => {
    if (!buyDirectionRef.current) {
      console.error("Buy Direction ref not found");
      alert("Error: Buy Direction Letter template not ready. Please try again.");
      return;
    }

    setIsGeneratingBuyDirection(true);

    try {
      const canvas = await html2canvas(buyDirectionRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        allowTaint: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`buy-direction-letter-${invoiceData.clientName || "draft"}.pdf`);
    } catch (error) {
      console.error("Error generating Buy Direction Letter PDF:", error);
      alert("Error generating Buy Direction Letter. Please try again.");
    } finally {
      setIsGeneratingBuyDirection(false);
    }
  };

  // Only show rows that have data
  const displayItems = invoiceData.lineItems;

  return (
    <div className={styles.pageContainer}>
      {/* Saved Invoices Panel */}
      <div className={`${styles.savedPanel} ${showSavedPanel ? styles.panelOpen : styles.panelClosed}`}>
        <div className={styles.savedPanelHeader}>
          <h2>Saved Invoices</h2>
          <button
            className={styles.togglePanelBtn}
            onClick={() => setShowSavedPanel(!showSavedPanel)}
          >
            {showSavedPanel ? "«" : "»"}
          </button>
        </div>
        {showSavedPanel && (
          <div className={styles.savedPanelContent}>
            <button className={styles.newInvoiceBtn} onClick={newInvoice}>
              + New Invoice
            </button>
            {isLoading ? (
              <div className={styles.loadingText}>Loading...</div>
            ) : savedInvoices.length === 0 ? (
              <div className={styles.emptyText}>No saved invoices</div>
            ) : (
              <div className={styles.invoiceList}>
                {savedInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`${styles.invoiceItem} ${currentInvoiceId === invoice.id ? styles.invoiceItemActive : ""}`}
                  >
                    <div
                      className={styles.invoiceItemContent}
                      onClick={() => loadInvoice(invoice)}
                    >
                      <div className={styles.invoiceItemTitle}>
                        {invoice.invoice_number || "Draft"}
                      </div>
                      <div className={styles.invoiceItemClient}>
                        {invoice.client_name || "No client"}
                      </div>
                      <div className={styles.invoiceItemMeta}>
                        {formatCurrency(invoice.grand_total || 0)}
                        {invoice.creator && (
                          <span className={styles.invoiceItemCreator}>
                            by {invoice.creator.first_name}
                          </span>
                        )}
                      </div>
                      <div className={styles.invoiceItemDate}>
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      className={styles.deleteInvoiceBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteInvoice(invoice.id);
                      }}
                      title="Delete invoice"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form Section */}
      <div className={styles.formSection}>
        <div className={styles.formHeader}>
          <h1 className={styles.pageTitle}>
            {currentInvoiceId ? "Edit Invoice" : "Create Invoice"}
          </h1>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={saveInvoice}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : currentInvoiceId ? "Update Invoice" : "Save Invoice"}
            </button>
          </div>
        </div>

        <div className={styles.formGrid}>
          {/* Left Column - Client Info */}
          <div className={styles.formColumn}>
            <h2 className={styles.sectionTitle}>Client Information</h2>
            <div className={styles.formGroup}>
              <label>Date</label>
              <input
                type="text"
                value={invoiceData.date}
                onChange={(e) => updateField("date", e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Client Name</label>
              <input
                type="text"
                value={invoiceData.clientName}
                onChange={(e) => updateField("clientName", e.target.value)}
                placeholder="Enter client name"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Acct. Number</label>
              <input
                type="text"
                value={invoiceData.acctNumber}
                onChange={(e) => updateField("acctNumber", e.target.value)}
                placeholder="Enter account number"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Account Type (Optional)</label>
              <input
                type="text"
                value={invoiceData.accountType}
                onChange={(e) => updateField("accountType", e.target.value)}
                placeholder="e.g., Traditional IRA, Roth IRA"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={invoiceData.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="Enter email address"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Daytime Phone</label>
              <input
                type="tel"
                value={invoiceData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Acct. Rep</label>
              <input
                type="text"
                value={invoiceData.acctRep}
                onChange={(e) => updateField("acctRep", e.target.value)}
                placeholder="Enter account rep"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Acct. Rep 2</label>
              <input
                type="text"
                value={invoiceData.acctRep2}
                onChange={(e) => updateField("acctRep2", e.target.value)}
                placeholder="Enter second account rep (optional)"
              />
            </div>
          </div>

          {/* Right Column - Invoice Info */}
          <div className={styles.formColumn}>
            <h2 className={styles.sectionTitle}>Invoice Details</h2>
            <div className={styles.formGroup}>
              <label>Sales Invoice No.</label>
              <input
                type="text"
                value={invoiceData.salesInvoiceNo}
                onChange={(e) => updateField("salesInvoiceNo", e.target.value)}
                placeholder="Enter invoice number"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Bill To</label>
              <textarea
                value={invoiceData.billTo}
                onChange={(e) => updateField("billTo", e.target.value)}
                placeholder="Enter billing address"
                rows={3}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Ship To</label>
              <textarea
                value={invoiceData.shipTo}
                onChange={(e) => updateField("shipTo", e.target.value)}
                placeholder="Enter shipping address"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Payment Instructions for Buy Direction Letter */}
        <div className={styles.paymentSection}>
          <h2 className={styles.sectionTitle}>Payment Instructions (Buy Direction Letter)</h2>
          <div className={styles.checkboxGrid}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={paymentOptions.wire}
                onChange={(e) => updatePaymentOption("wire", e.target.checked)}
              />
              <span>Wire</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={paymentOptions.overnightCheck}
                onChange={(e) => updatePaymentOption("overnightCheck", e.target.checked)}
              />
              <span>Overnight Check</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={paymentOptions.chargeEntrustAccount}
                onChange={(e) => updatePaymentOption("chargeEntrustAccount", e.target.checked)}
              />
              <span>Charge Entrust Account</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={paymentOptions.thirdPartyBilling}
                onChange={(e) => updatePaymentOption("thirdPartyBilling", e.target.checked)}
              />
              <span>Use third-party billing agreement</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={paymentOptions.fedex}
                onChange={(e) => updatePaymentOption("fedex", e.target.checked)}
              />
              <span>FedEx</span>
            </label>
            <div className={styles.upsOption}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={paymentOptions.ups}
                  onChange={(e) => updatePaymentOption("ups", e.target.checked)}
                />
                <span>UPS</span>
              </label>
              {paymentOptions.ups && (
                <input
                  type="text"
                  className={styles.upsAccountInput}
                  value={paymentOptions.upsAccountNumber}
                  onChange={(e) => updatePaymentOption("upsAccountNumber", e.target.value)}
                  placeholder="UPS Account #"
                />
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className={styles.lineItemsSection}>
          <h2 className={styles.sectionTitle}>Line Items</h2>
          <div className={styles.lineItemsHeader}>
            <span className={styles.colProduct}>Product Name</span>
            <span className={styles.colQty}>QTY</span>
            <span className={styles.colPrice}>List Price</span>
            <span className={styles.colTotal}>Total</span>
            <span className={styles.colAction}></span>
          </div>
          {invoiceData.lineItems.map((item, index) => (
            <div
              key={item.id}
              className={`${styles.lineItemRow} ${index % 2 === 0 ? styles.rowWhite : styles.rowGold}`}
            >
              <input
                type="text"
                className={styles.colProduct}
                value={item.productName}
                onChange={(e) => updateLineItem(item.id, "productName", e.target.value)}
                placeholder="Product name"
              />
              <input
                type="text"
                className={styles.colQty}
                value={item.qty}
                onChange={(e) => updateLineItem(item.id, "qty", e.target.value)}
                placeholder="0"
              />
              <input
                type="text"
                className={styles.colPrice}
                value={item.listPrice}
                onChange={(e) => updateLineItem(item.id, "listPrice", e.target.value)}
                placeholder="$0.00"
              />
              <span className={styles.colTotal}>
                {formatCurrency(calculateLineTotal(item.qty, item.listPrice))}
              </span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeRow(item.id)}
                disabled={invoiceData.lineItems.length === 1}
              >
                &times;
              </button>
            </div>
          ))}
          <button type="button" className={styles.addRowBtn} onClick={addRow}>
            + Add Row
          </button>
        </div>

        {/* Grand Total */}
        <div className={styles.grandTotalSection}>
          <label>Grand Total</label>
          <span className={styles.grandTotalDisplay}>
            {formatCurrency(calculateGrandTotal())}
          </span>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.previewBtn}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
          <button
            type="button"
            className={styles.generateBtn}
            onClick={generatePDF}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate Invoice PDF"}
          </button>
          <button
            type="button"
            className={styles.buyDirectionBtn}
            onClick={generateBuyDirectionLetter}
            disabled={isGeneratingBuyDirection}
          >
            {isGeneratingBuyDirection ? "Generating..." : "Generate Buy Direction Letter"}
          </button>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {showPreview && (
        <div className={styles.modalOverlay} onClick={() => setShowPreview(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.previewTitle}>Invoice Preview</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setShowPreview(false)}
              >
                &times;
              </button>
            </div>
            <div className={styles.previewContainer}>
              <div className={styles.invoice}>
              {/* Header */}
              <div className={styles.invoiceHeader}>
                <div className={styles.logoContainer}>
                  <img
                    src="/citadel-gold-logo.png"
                    alt="Citadel Gold"
                    className={styles.logo}
                  />
                </div>
                <h1 className={styles.invoiceTitle}>CITADEL GOLD INVOICE</h1>
              </div>

              {/* Gold Accent Bar */}
              <div className={styles.goldBar}></div>

              {/* Main Content */}
              <div className={styles.invoiceBody}>
                {/* Date */}
                <div className={styles.dateSection}>
                  <span className={styles.dateLabel}>{invoiceData.date}</span>
                </div>

                {/* Info Section */}
                <div className={styles.infoSection}>
                  <div className={styles.clientInfo}>
                    <p><strong>Client Name</strong> {invoiceData.clientName}</p>
                    <p><strong>Acct. Number</strong> {invoiceData.acctNumber}</p>
                    <p><strong>Acct. Rep.</strong> {invoiceData.acctRep}</p>
                    {invoiceData.acctRep2 && (
                      <p><strong>Acct. Rep.</strong> {invoiceData.acctRep2}</p>
                    )}
                  </div>
                  <div className={styles.companyInfo}>
                    <p><strong>Purchase Confirmation:</strong></p>
                    <p>Sales Invoice No: {invoiceData.salesInvoiceNo}</p>
                    <p>Citadel Gold, LLC</p>
                    <p>12100 Wilshire Blvd. #800</p>
                    <p>Los Angeles CA, 90025</p>
                    <p>www.citadelgold.com</p>
                  </div>
                </div>

                {/* Table */}
                <div className={styles.tableContainer}>
                  <div className={styles.tableHeader}>
                    <span className={styles.thProduct}>PRODUCT NAME</span>
                    <span className={styles.thQty}>QTY</span>
                    <span className={styles.thPrice}>LIST PRICE</span>
                    <span className={styles.thTotal}>TOTAL</span>
                  </div>
                  {displayItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={`${styles.tableRow} ${index % 2 === 0 ? styles.tableRowWhite : styles.tableRowGold}`}
                    >
                      <span className={styles.tdProduct}>{item.productName}</span>
                      <span className={styles.tdQty}>{item.qty}</span>
                      <span className={styles.tdPrice}>{item.listPrice ? formatCurrency(parseFloat(item.listPrice.replace(/[^0-9.-]/g, "")) || 0) : ""}</span>
                      <span className={styles.tdTotal}>{item.qty && item.listPrice ? formatCurrency(calculateLineTotal(item.qty, item.listPrice)) : ""}</span>
                    </div>
                  ))}
                </div>

                {/* Grand Total */}
                <div className={styles.grandTotalRow}>
                  <div className={styles.grandTotalBox}>
                    <span>GRAND TOTAL : </span>
                    <span>{formatCurrency(calculateGrandTotal())}</span>
                  </div>
                </div>

                {/* Bill To / Ship To */}
                <div className={styles.addressSection}>
                  <div className={styles.addressBlock}>
                    <p className={styles.addressLabel}>Bill To:</p>
                    <p className={styles.addressText}>{invoiceData.billTo}</p>
                  </div>
                  <div className={styles.addressBlock}>
                    <p className={styles.addressLabel}>Ship To:</p>
                    <p className={styles.addressText}>{invoiceData.shipTo}</p>
                  </div>
                </div>

                {/* Shipping Info */}
                <div className={styles.shippingInfo}>
                  <p>
                    Shipping Information: Orders may take up to 28 days to arrive, as outlined by our wholesalers' timeline, to account for potential product shortages and unforeseen shipping delays. Most shipments are fully insured, require a signature upon delivery, and typically arrive within 7 business days via UPS, FedEx, or USPS. Tracking details will be provided once your order is packaged and ready for shipment.
                  </p>
                </div>

                {/* Tagline */}
                <div className={styles.tagline}>
                  <p>Fortifying Your Future One Precious Metal at a Time</p>
                </div>
              </div>

              {/* Footer */}
              <div className={styles.invoiceFooter}>
                <div className={styles.footerLogo}>
                  <img
                    src="/citadel-gold-logo.png"
                    alt="Citadel Gold"
                    className={styles.footerLogoImg}
                  />
                </div>
                <div className={styles.footerContact}>
                  <p><strong>Phone:</strong> 310-209.8166 | <strong>Email:</strong> info@citadelgold.com</p>
                  <p><strong>Website:</strong> www.citadelgold.com</p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden invoice for PDF generation - always rendered off-screen */}
      <div className={styles.hiddenPdfContainer}>
        <div ref={invoiceRef} className={styles.invoice}>
          {/* Header */}
          <div className={styles.invoiceHeader}>
            <div className={styles.logoContainer}>
              <img
                src="/citadel-gold-logo.png"
                alt="Citadel Gold"
                className={styles.logo}
              />
            </div>
            <h1 className={styles.invoiceTitle}>CITADEL GOLD INVOICE</h1>
          </div>

          {/* Gold Accent Bar */}
          <div className={styles.goldBar}></div>

          {/* Main Content */}
          <div className={styles.invoiceBody}>
            {/* Date */}
            <div className={styles.dateSection}>
              <span className={styles.dateLabel}>{invoiceData.date}</span>
            </div>

            {/* Info Section */}
            <div className={styles.infoSection}>
              <div className={styles.clientInfo}>
                <p><strong>Client Name</strong> {invoiceData.clientName}</p>
                <p><strong>Acct. Number</strong> {invoiceData.acctNumber}</p>
                <p><strong>Acct. Rep.</strong> {invoiceData.acctRep}</p>
                {invoiceData.acctRep2 && (
                  <p><strong>Acct. Rep.</strong> {invoiceData.acctRep2}</p>
                )}
              </div>
              <div className={styles.companyInfo}>
                <p><strong>Purchase Confirmation:</strong></p>
                <p>Sales Invoice No: {invoiceData.salesInvoiceNo}</p>
                <p>Citadel Gold, LLC</p>
                <p>12100 Wilshire Blvd. #800</p>
                <p>Los Angeles CA, 90025</p>
                <p>www.citadelgold.com</p>
              </div>
            </div>

            {/* Table */}
            <div className={styles.tableContainer}>
              <div className={styles.tableHeader}>
                <span className={styles.thProduct}>PRODUCT NAME</span>
                <span className={styles.thQty}>QTY</span>
                <span className={styles.thPrice}>LIST PRICE</span>
                <span className={styles.thTotal}>TOTAL</span>
              </div>
              {displayItems.map((item, index) => (
                <div
                  key={`pdf-${item.id}`}
                  className={`${styles.tableRow} ${index % 2 === 0 ? styles.tableRowWhite : styles.tableRowGold}`}
                >
                  <span className={styles.tdProduct}>{item.productName}</span>
                  <span className={styles.tdQty}>{item.qty}</span>
                  <span className={styles.tdPrice}>{item.listPrice ? formatCurrency(parseFloat(String(item.listPrice).replace(/[^0-9.]/g, "")) || 0) : ""}</span>
                  <span className={styles.tdTotal}>{item.qty && item.listPrice ? formatCurrency(calculateLineTotal(item.qty, item.listPrice)) : ""}</span>
                </div>
              ))}
            </div>

            {/* Grand Total */}
            <div className={styles.grandTotalRow}>
              <div className={styles.grandTotalBox}>
                <span>GRAND TOTAL : </span>
                <span>{formatCurrency(calculateGrandTotal())}</span>
              </div>
            </div>

            {/* Bill To / Ship To */}
            <div className={styles.addressSection}>
              <div className={styles.addressBlock}>
                <p className={styles.addressLabel}>Bill To:</p>
                <p className={styles.addressText}>{invoiceData.billTo}</p>
              </div>
              <div className={styles.addressBlock}>
                <p className={styles.addressLabel}>Ship To:</p>
                <p className={styles.addressText}>{invoiceData.shipTo}</p>
              </div>
            </div>

            {/* Shipping Info */}
            <div className={styles.shippingInfo}>
              <p>
                Shipping Information: Orders may take up to 28 days to arrive, as outlined by our wholesalers' timeline, to account for potential product shortages and unforeseen shipping delays. Most shipments are fully insured, require a signature upon delivery, and typically arrive within 7 business days via UPS, FedEx, or USPS. Tracking details will be provided once your order is packaged and ready for shipment.
              </p>
            </div>

            {/* Tagline */}
            <div className={styles.tagline}>
              <p>Fortifying Your Future One Precious Metal at a Time</p>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.invoiceFooter}>
            <div className={styles.footerLogo}>
              <img
                src="/citadel-gold-logo.png"
                alt="Citadel Gold"
                className={styles.footerLogoImg}
              />
            </div>
            <div className={styles.footerContact}>
              <p><strong>Phone:</strong> 310-209.8166 | <strong>Email:</strong> info@citadelgold.com</p>
              <p><strong>Website:</strong> www.citadelgold.com</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Buy Direction Letter for PDF generation - EXACT CLONE OF ENTRUST PDF */}
      <div className={styles.hiddenPdfContainer}>
        <div ref={buyDirectionRef} className={styles.bdl}>
          {/* Header */}
          <div className={styles.bdlHeader}>
            <div className={styles.bdlLogo}>
              <img src="/entrust.png" alt="The Entrust Group" />
            </div>
            <div className={styles.bdlHeaderCenter}>
              <div className={styles.bdlHeaderTitle}>Precious Metals</div>
              <div className={styles.bdlHeaderSubtitle}>Buy Direction Letter</div>
            </div>
            <div className={styles.bdlHeaderRight}>
              <div>555 12th Street, Suite 900</div>
              <div>Oakland, CA 94607</div>
              <div>Phone: (877) 545-0544</div>
              <div>Fax: (866) 228-4009</div>
              <div>preciousmetals@theentrustgroup.com</div>
            </div>
          </div>
          <div className={styles.bdlHeaderLine}></div>

          {/* Section 1: Account Owner Information */}
          <div className={styles.bdlSection}>
            <div className={styles.bdlSectionHeader}>
              <div className={styles.bdlSectionNum}>1</div>
              <div className={styles.bdlSectionTitle}>Account Owner Information</div>
            </div>
            <table className={styles.bdlFormTable}>
              <tbody>
                <tr>
                  <td className={styles.bdlCell} style={{width: '45%'}}>
                    <div className={styles.bdlCellLabel}>NAME <span className={styles.bdlCellLabelSub}>(as it appears on your account application)</span></div>
                    <div className={styles.bdlCellValue}>{invoiceData.clientName}</div>
                  </td>
                  <td className={styles.bdlCell} style={{width: '30%'}}>
                    <div className={styles.bdlCellLabel}>ENTRUST ACCOUNT NUMBER</div>
                    <div className={styles.bdlCellValue}>{invoiceData.acctNumber}</div>
                  </td>
                  <td className={styles.bdlCell} style={{width: '25%'}}>
                    <div className={styles.bdlCellLabel}>ACCOUNT TYPE</div>
                    <div className={styles.bdlCellValue}>{invoiceData.accountType}</div>
                  </td>
                </tr>
                <tr>
                  <td className={styles.bdlCell} colSpan={2}>
                    <div className={styles.bdlCellLabel}>EMAIL ADDRESS <span className={styles.bdlCellLabelSub}>(required)</span></div>
                    <div className={styles.bdlCellValue}>{invoiceData.email}</div>
                  </td>
                  <td className={styles.bdlCell}>
                    <div className={styles.bdlCellLabel}>DAYTIME PHONE NUMBER</div>
                    <div className={styles.bdlCellValue}>{invoiceData.phone}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 2: Precious Metals Dealer Information */}
          <div className={styles.bdlSection}>
            <div className={styles.bdlSectionHeader}>
              <div className={styles.bdlSectionNum}>2</div>
              <div className={styles.bdlSectionTitle}>Precious Metals Dealer Information</div>
            </div>
            <table className={styles.bdlFormTable}>
              <tbody>
                <tr>
                  <td className={styles.bdlCell} style={{width: '30%'}}>
                    <div className={styles.bdlCellLabel}>DEALER NAME</div>
                    <div className={styles.bdlCellValue}>Citadel Gold</div>
                  </td>
                  <td className={styles.bdlCell} colSpan={2} style={{width: '70%'}}>
                    <div className={styles.bdlCellLabel}>DEALER ADDRESS</div>
                    <div className={styles.bdlCellValue}>10433 Wilshire Blvd #1002 Los Angeles, California 90024</div>
                  </td>
                </tr>
                <tr>
                  <td className={styles.bdlCell} style={{width: '30%'}}>
                    <div className={styles.bdlCellLabel}>PHONE NUMBER</div>
                    <div className={styles.bdlCellValue}>310-209-8166</div>
                  </td>
                  <td className={styles.bdlCell} style={{width: '35%'}}>
                    <div className={styles.bdlCellLabel}>FAX</div>
                    <div className={styles.bdlCellValue}>310-209-8255</div>
                  </td>
                  <td className={styles.bdlCell} style={{width: '35%'}}>
                    <div className={styles.bdlCellLabel}>REPRESENTATIVE</div>
                    <div className={styles.bdlCellValue}>Shaun Bina</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Authorization Text - Outside table */}
          <div className={styles.bdlAuthSection}>
            <div className={styles.bdlAuthText}>
              <strong>By initialing, I authorize the administrator to accept completion of transaction details for the sections below from the dealer listed in Section 2, without my verification. I understand that Entrust will advise the dealer of this authorization and the funds in the IRA, and will await confirmation from the dealer.</strong>
            </div>
            <div className={styles.bdlInitialBox}>
              <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
              <div className={styles.bdlInitialSpace}></div>
            </div>
          </div>

          {/* Section 3: Payment Instructions */}
          <div className={styles.bdlSection}>
            <div className={styles.bdlSectionHeader}>
              <div className={styles.bdlSectionNum}>3</div>
              <div className={styles.bdlSectionTitle}>Payment Instructions <span className={styles.bdlSelectOne}>(select one)</span></div>
            </div>
            <div className={styles.bdlPaymentGrid}>
              <div className={styles.bdlPaymentLeft}>
                <div className={styles.bdlCheckItem}>
                  <span className={styles.bdlCheckBox}>{paymentOptions.wire ? "X" : ""}</span>
                  <span>WIRE <span className={styles.bdlCheckNote}>(invoice must be attached)</span></span>
                </div>
              </div>
              <div className={styles.bdlPaymentRight}>
                <div className={styles.bdlCheckItem}>
                  <span className={styles.bdlCheckBox}>{paymentOptions.overnightCheck ? "X" : ""}</span>
                  <span>OVERNIGHT CHECK <span className={styles.bdlCheckNote}>($30 fee applies; cannot overnight to a PO Box. Also, invoice must be attached)</span></span>
                </div>
                <div className={styles.bdlCheckItem}>
                  <span className={styles.bdlCheckBox}>{paymentOptions.chargeEntrustAccount ? "X" : ""}</span>
                  <span>Charge my Entrust Account</span>
                </div>
                <div className={styles.bdlCheckItem}>
                  <span className={styles.bdlCheckBox}>{paymentOptions.thirdPartyBilling ? "X" : ""}</span>
                  <span>Use third-party billing</span>
                </div>
                <div className={styles.bdlCheckItem} style={{marginLeft: '20px'}}>
                  <span className={styles.bdlCheckBox}>{paymentOptions.fedex ? "X" : ""}</span>
                  <span>FedEx</span>
                  <span className={styles.bdlCheckBox} style={{marginLeft: '12px'}}>{paymentOptions.ups ? "X" : ""}</span>
                  <span>UPS</span>
                  <span style={{marginLeft: '8px'}}>Account #:</span>
                  <span className={styles.bdlUpsLine}>{paymentOptions.upsAccountNumber}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Purchase Instructions */}
          <div className={styles.bdlSection}>
            <div className={styles.bdlSectionHeader}>
              <div className={styles.bdlSectionNum}>4</div>
              <div className={styles.bdlSectionTitle}>Purchase Instructions</div>
            </div>
            <div className={styles.bdlPurchaseIntro}>
              <strong>I hereby direct the administrator and/or custodian to BUY the following asset(s) for my account:</strong>
            </div>
            <table className={styles.bdlPurchaseTable}>
              <thead>
                <tr>
                  <th style={{width: '10%'}}>Quantity<br/><span className={styles.bdlThSub}>(number of units)</span></th>
                  <th style={{width: '10%'}}>Metal Type</th>
                  <th style={{width: '24%'}}>Asset Name or Description<br/><span className={styles.bdlThSub}>(U.S. Silver Eagle, 1oz.)</span></th>
                  <th style={{width: '10%'}}>Proof Am.<br/>Eagle?</th>
                  <th style={{width: '12%'}}>Troy OZ. Each</th>
                  <th style={{width: '14%'}}>Price<br/><span className={styles.bdlThSub}>(per number of units)</span></th>
                  <th style={{width: '20%'}}>Total Purchase Price<br/><span className={styles.bdlThSub}>(quantity times price)</span></th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item, idx) => (
                  <tr key={`bdl-${item.id}`}>
                    <td>{item.qty}</td>
                    <td>{item.productName?.split(' ')[0] || ''}</td>
                    <td>{item.productName}</td>
                    <td></td>
                    <td></td>
                    <td>$ {item.listPrice ? parseFloat(String(item.listPrice).replace(/[^0-9.]/g, "")).toFixed(2) : ''}</td>
                    <td>$ {item.qty && item.listPrice ? calculateLineTotal(item.qty, item.listPrice).toFixed(2) : ''}</td>
                  </tr>
                ))}
                {/* Add empty rows - 5 minimum rows */}
                {Array.from({ length: Math.max(0, 5 - displayItems.length) }).map((_, idx) => (
                  <tr key={`empty-${idx}`}>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>$</td>
                    <td>$</td>
                  </tr>
                ))}
                <tr className={styles.bdlSpecialRow}>
                  <td colSpan={5}><strong>Special Instructions:</strong></td>
                  <td>$<span style={{marginLeft: '20px'}}>Total $</span></td>
                  <td>Total</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className={styles.bdlFooter}>
            <div className={styles.bdlFooterLeft}>Page 1 of 2</div>
            <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
          </div>
        </div>
      </div>
    </div>
  );
}
