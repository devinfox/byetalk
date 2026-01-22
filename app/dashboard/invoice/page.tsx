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
  proofAmEagle: boolean;
  troyOzEach: string;
};

type InvoiceData = {
  name: string;
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

type DepositoryInfo = {
  depositoryName: string;
  contactName: string;
  contactPhone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  storageAgreementAttached: boolean;
};

type SellLineItem = {
  id: string;
  quantity: string;
  metalType: string;
  description: string;
  proofAm: string;
  troyOz: string;
  price: string;
};

type DepositoryOptions = {
  delawareWilmington: boolean;
  delawareBoulder: boolean;
  dakota: boolean;
  milesFranklin: boolean;
  amglLasVegas: boolean;
  amglIrving: boolean;
  idahoArmored: boolean;
  cnt: boolean;
  brinksLA: boolean;
  brinksSaltLake: boolean;
  brinksJFK: boolean;
};

type DepositMethod = {
  wire: boolean;
  ach: boolean;
  check: boolean;
  overnightCheck: boolean;
};

type FeePaymentMethod = {
  payWithCash: boolean;
  creditCard: boolean;
  thirdPartyBilling: boolean;
  fedex: boolean;
  ups: boolean;
  accountNumber: string;
};

type CreditCardInfo = {
  nameOnCard: string;
  cardType: 'visa' | 'mastercard' | 'amex' | 'discover' | '';
  cardNumber: string;
  expirationDate: string;
  billingStreet: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
};

type SellData = {
  lineItems: SellLineItem[];
  specialInstructions: string;
  deliveryRecipient: string;
  subAccountNumber: string;
  shippingStreet: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  depository: DepositoryOptions;
  depositMethod: DepositMethod;
  feePayment: FeePaymentMethod;
  creditCard: CreditCardInfo;
};

type SavedInvoice = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string | null;
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
  proofAmEagle: false,
  troyOzEach: "",
});

// Calculate line item total from qty and price
const calculateLineTotal = (qty: string, listPrice: string): number => {
  const qtyNum = Number(qty) || 0;
  // Remove currency symbols and commas from price
  const cleanPrice = String(listPrice || "").replace(/[^0-9.]/g, "");
  const priceNum = Number(cleanPrice) || 0;
  return qtyNum * priceNum;
};

// Calculate sell line total (quantity * price)
const calculateSellLineTotal = (quantity: string, price: string): number => {
  const qtyNum = Number(quantity) || 0;
  const cleanPrice = String(price || "").replace(/[^0-9.]/g, "");
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

// Chunk array into groups of specified size (for pagination)
const chunkArray = <T,>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [[]]; // Return at least one empty chunk
};

const initialInvoiceData: InvoiceData = {
  name: "",
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

const initialDepositoryInfo: DepositoryInfo = {
  depositoryName: "",
  contactName: "",
  contactPhone: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  storageAgreementAttached: false,
};

const initialSellLineItem = (): SellLineItem => ({
  id: crypto.randomUUID(),
  quantity: "",
  metalType: "",
  description: "",
  proofAm: "",
  troyOz: "",
  price: "",
});

const initialSellData: SellData = {
  lineItems: [initialSellLineItem()],
  specialInstructions: "",
  deliveryRecipient: "",
  subAccountNumber: "",
  shippingStreet: "",
  shippingCity: "",
  shippingState: "",
  shippingZip: "",
  depository: {
    delawareWilmington: false,
    delawareBoulder: false,
    dakota: false,
    milesFranklin: false,
    amglLasVegas: false,
    amglIrving: false,
    idahoArmored: false,
    cnt: false,
    brinksLA: false,
    brinksSaltLake: false,
    brinksJFK: false,
  },
  depositMethod: {
    wire: false,
    ach: false,
    check: false,
    overnightCheck: false,
  },
  feePayment: {
    payWithCash: false,
    creditCard: false,
    thirdPartyBilling: false,
    fedex: false,
    ups: false,
    accountNumber: "",
  },
  creditCard: {
    nameOnCard: "",
    cardType: "",
    cardNumber: "",
    expirationDate: "",
    billingStreet: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
  },
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
  const [depositoryInfo, setDepositoryInfo] = useState<DepositoryInfo>(initialDepositoryInfo);
  const [isGeneratingBuyDirection, setIsGeneratingBuyDirection] = useState(false);
  const [previewTab, setPreviewTab] = useState<'invoice' | 'buyDirection' | 'sellDirection' | 'combined'>('invoice');
  const [isBuyAndSell, setIsBuyAndSell] = useState(false);
  const [sellData, setSellData] = useState<SellData>(initialSellData);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const buyDirectionRef = useRef<HTMLDivElement>(null);
  const previewInvoiceRef = useRef<HTMLDivElement>(null);
  const previewBuyDirectionRef = useRef<HTMLDivElement>(null);
  const previewSellDirectionRef = useRef<HTMLDivElement>(null);
  const previewCombinedRef = useRef<HTMLDivElement>(null);

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

  const updateLineItem = (id: string, field: keyof LineItem, value: string | boolean) => {
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

  const calculateSellGrandTotal = (): number => {
    return sellData.lineItems.reduce((sum, item) => {
      return sum + calculateSellLineTotal(item.quantity, item.price);
    }, 0);
  };

  const saveInvoice = async () => {
    setIsSaving(true);
    try {
      const payload = {
        name: invoiceData.name,
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
      name: invoice.name || "",
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
            proofAmEagle: (item as LineItem).proofAmEagle || false,
            troyOzEach: (item as LineItem).troyOzEach || "",
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
    // Use the visible preview element for pixel-perfect capture
    const targetRef = previewInvoiceRef.current;
    if (!targetRef) {
      console.error("Invoice ref not found");
      alert("Error: Invoice template not ready. Please try again.");
      return;
    }

    setIsGenerating(true);

    try {
      const canvas = await html2canvas(targetRef, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        allowTaint: true,
        width: 816,
        height: 1056,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc, element) => {
          // Remove any transforms that might affect rendering
          element.style.transform = 'none';
          element.style.transformOrigin = 'top left';
          element.style.margin = '0';
          element.style.width = '816px';
          element.style.minHeight = '1056px';
        },
      });

      const imgData = canvas.toDataURL("image/png");
      // Use fixed letter size for consistent output
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
      });

      // Scale to US Letter: 612 x 792 points
      pdf.addImage(imgData, "PNG", 0, 0, 612, 792);
      pdf.save(`invoice-${invoiceData.salesInvoiceNo || "draft"}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateBuyDirectionLetter = async () => {
    const targetRef = previewBuyDirectionRef.current;
    if (!targetRef) {
      console.error("Buy Direction ref not found");
      alert("Error: Buy Direction Letter template not ready. Please try again.");
      return;
    }

    // Open a new window with just the Buy Direction Letter content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print the Buy Direction Letter.");
      return;
    }

    // Get all stylesheets
    const styleSheets = Array.from(document.styleSheets);
    let cssText = "";
    styleSheets.forEach((sheet) => {
      try {
        const rules = Array.from(sheet.cssRules || []);
        rules.forEach((rule) => {
          cssText += rule.cssText + "\n";
        });
      } catch (e) {
        // Skip cross-origin stylesheets
      }
    });

    // Write the print document
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Buy Direction Letter - ${invoiceData.clientName || "Draft"}</title>
        <style>
          ${cssText}
          @media print {
            @page {
              size: letter;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
        </style>
      </head>
      <body>
        ${targetRef.outerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const generateSellDirectionLetter = async () => {
    const targetRef = previewSellDirectionRef.current;
    if (!targetRef) {
      console.error("Sell Direction ref not found");
      alert("Error: Sell Direction Letter template not ready. Please try again.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print the Sell Direction Letter.");
      return;
    }

    const styleSheets = Array.from(document.styleSheets);
    let cssText = "";
    styleSheets.forEach((sheet) => {
      try {
        const rules = Array.from(sheet.cssRules || []);
        rules.forEach((rule) => {
          cssText += rule.cssText + "\n";
        });
      } catch (e) {
        // Skip cross-origin stylesheets
      }
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sell Direction Letter - ${invoiceData.clientName || "Draft"}</title>
        <style>
          ${cssText}
          @media print {
            @page {
              size: letter;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
        </style>
      </head>
      <body>
        ${targetRef.outerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const generateCombinedDocument = async () => {
    const targetRef = previewCombinedRef.current;
    if (!targetRef) {
      console.error("Combined ref not found");
      alert("Error: Combined document template not ready. Please try again.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print the Combined Document.");
      return;
    }

    const styleSheets = Array.from(document.styleSheets);
    let cssText = "";
    styleSheets.forEach((sheet) => {
      try {
        const rules = Array.from(sheet.cssRules || []);
        rules.forEach((rule) => {
          cssText += rule.cssText + "\n";
        });
      } catch (e) {
        // Skip cross-origin stylesheets
      }
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Combined Documents - ${invoiceData.clientName || "Draft"}</title>
        <style>
          ${cssText}
          @media print {
            @page {
              size: letter;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .page-break {
              display: none !important;
              height: 0 !important;
              page-break-after: auto;
            }
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .page-break {
            height: 40px;
          }
        </style>
      </head>
      <body>
        ${targetRef.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
    };
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
                        {invoice.name || invoice.invoice_number || "Draft"}
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
            <label className={styles.headerCheckbox}>
              <input
                type="checkbox"
                checked={isBuyAndSell}
                onChange={(e) => setIsBuyAndSell(e.target.checked)}
              />
              <span>Buy and Sell Transaction</span>
            </label>
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

        {/* Invoice Name */}
        <div className={styles.invoiceNameSection}>
          <div className={styles.formGroup}>
            <label>Invoice Name (for saving)</label>
            <input
              type="text"
              value={invoiceData.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g., Smith IRA Purchase - January 2025"
            />
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

        {/* Depository Information for Buy Direction Letter Page 2 */}
        <div className={styles.paymentSection}>
          <h2 className={styles.sectionTitle}>Depository Information (Buy Direction Page 2)</h2>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label>Depository Name</label>
              <input
                type="text"
                value={depositoryInfo.depositoryName}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, depositoryName: e.target.value })}
                placeholder="Depository Name"
              />
            </div>
            <div className={styles.formField}>
              <label>Contact Name</label>
              <input
                type="text"
                value={depositoryInfo.contactName}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, contactName: e.target.value })}
                placeholder="Contact Name"
              />
            </div>
            <div className={styles.formField}>
              <label>Contact Phone</label>
              <input
                type="text"
                value={depositoryInfo.contactPhone}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, contactPhone: e.target.value })}
                placeholder="Contact Phone Number"
              />
            </div>
            <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
              <label>Depository Street Address</label>
              <input
                type="text"
                value={depositoryInfo.streetAddress}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, streetAddress: e.target.value })}
                placeholder="Street Address"
              />
            </div>
            <div className={styles.formField}>
              <label>City</label>
              <input
                type="text"
                value={depositoryInfo.city}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, city: e.target.value })}
                placeholder="City"
              />
            </div>
            <div className={styles.formField}>
              <label>State</label>
              <input
                type="text"
                value={depositoryInfo.state}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, state: e.target.value })}
                placeholder="State"
              />
            </div>
            <div className={styles.formField}>
              <label>Zip Code</label>
              <input
                type="text"
                value={depositoryInfo.zipCode}
                onChange={(e) => setDepositoryInfo({ ...depositoryInfo, zipCode: e.target.value })}
                placeholder="Zip Code"
              />
            </div>
          </div>
          <label className={styles.checkboxLabel} style={{ marginTop: '1rem' }}>
            <input
              type="checkbox"
              checked={depositoryInfo.storageAgreementAttached}
              onChange={(e) => setDepositoryInfo({ ...depositoryInfo, storageAgreementAttached: e.target.checked })}
            />
            <span>Depository Storage Agreement Attached</span>
          </label>
        </div>

        {/* Line Items */}
        <div className={styles.lineItemsSection}>
          <h2 className={styles.sectionTitle}>Line Items</h2>
          <div className={styles.lineItemsHeader}>
            <span className={styles.colProduct}>Product Name</span>
            <span className={styles.colQty}>QTY</span>
            <span className={styles.colPrice}>List Price</span>
            <span className={styles.colTotal}>Total</span>
            <span className={styles.colProof}>Proof Am?</span>
            <span className={styles.colTroyOz}>Troy Oz</span>
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
              <label className={styles.colProof}>
                <input
                  type="checkbox"
                  checked={item.proofAmEagle || false}
                  onChange={(e) => updateLineItem(item.id, "proofAmEagle", e.target.checked)}
                />
              </label>
              <input
                type="text"
                className={styles.colTroyOz}
                value={item.troyOzEach || ""}
                onChange={(e) => updateLineItem(item.id, "troyOzEach", e.target.value)}
                placeholder="0.00"
              />
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

        {/* Sell Section - Only shown when Buy and Sell is enabled */}
        {isBuyAndSell && (
          <div className={styles.paymentSection}>
            <h2 className={styles.sectionTitle}>Sell Information (Sell Direction Letter)</h2>

            {/* Sell Line Items */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Sell Items</h3>
              {sellData.lineItems.map((item, index) => (
                <div key={item.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...sellData.lineItems];
                      newItems[index].quantity = e.target.value;
                      setSellData({ ...sellData, lineItems: newItems });
                    }}
                    style={{ width: '60px', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Metal Type"
                    value={item.metalType}
                    onChange={(e) => {
                      const newItems = [...sellData.lineItems];
                      newItems[index].metalType = e.target.value;
                      setSellData({ ...sellData, lineItems: newItems });
                    }}
                    style={{ width: '100px', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => {
                      const newItems = [...sellData.lineItems];
                      newItems[index].description = e.target.value;
                      setSellData({ ...sellData, lineItems: newItems });
                    }}
                    style={{ flex: 1, minWidth: '150px', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Price"
                    value={item.price}
                    onChange={(e) => {
                      const newItems = [...sellData.lineItems];
                      newItems[index].price = e.target.value;
                      setSellData({ ...sellData, lineItems: newItems });
                    }}
                    style={{ width: '100px', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSellData({ ...sellData, lineItems: [...sellData.lineItems, initialSellLineItem()] })}
                style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}
              >
                + Add Sell Item
              </button>
            </div>

            {/* Delivery Instructions */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Delivery Instructions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Dealer/Depository/Recipient Name"
                  value={sellData.deliveryRecipient}
                  onChange={(e) => setSellData({ ...sellData, deliveryRecipient: e.target.value })}
                  style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                />
                <input
                  type="text"
                  placeholder="Sub-Account Number"
                  value={sellData.subAccountNumber}
                  onChange={(e) => setSellData({ ...sellData, subAccountNumber: e.target.value })}
                  style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                />
                <input
                  type="text"
                  placeholder="Street Address"
                  value={sellData.shippingStreet}
                  onChange={(e) => setSellData({ ...sellData, shippingStreet: e.target.value })}
                  style={{ gridColumn: 'span 2', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                />
                <input
                  type="text"
                  placeholder="City"
                  value={sellData.shippingCity}
                  onChange={(e) => setSellData({ ...sellData, shippingCity: e.target.value })}
                  style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="State"
                    value={sellData.shippingState}
                    onChange={(e) => setSellData({ ...sellData, shippingState: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Zip"
                    value={sellData.shippingZip}
                    onChange={(e) => setSellData({ ...sellData, shippingZip: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                </div>
              </div>
            </div>

            {/* Deposit Method */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Deposit Method</h3>
              <div className={styles.checkboxGrid}>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depositMethod.wire} onChange={(e) => setSellData({ ...sellData, depositMethod: { ...sellData.depositMethod, wire: e.target.checked } })} />
                  <span>Wire ($30 fee)</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depositMethod.ach} onChange={(e) => setSellData({ ...sellData, depositMethod: { ...sellData.depositMethod, ach: e.target.checked } })} />
                  <span>ACH</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depositMethod.check} onChange={(e) => setSellData({ ...sellData, depositMethod: { ...sellData.depositMethod, check: e.target.checked } })} />
                  <span>Check</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depositMethod.overnightCheck} onChange={(e) => setSellData({ ...sellData, depositMethod: { ...sellData.depositMethod, overnightCheck: e.target.checked } })} />
                  <span>Overnight Check ($30 fee)</span>
                </label>
              </div>
            </div>

            {/* Special Instructions */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Special Instructions</h3>
              <textarea
                placeholder="Enter special instructions..."
                value={sellData.specialInstructions}
                onChange={(e) => setSellData({ ...sellData, specialInstructions: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white', minHeight: '60px' }}
              />
            </div>

            {/* Current Depository Storage Location */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Current Depository Storage Location</h3>
              <div className={styles.checkboxGrid}>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.delawareWilmington} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, delawareWilmington: e.target.checked } })} />
                  <span>Delaware Depository - Wilmington</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.delawareBoulder} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, delawareBoulder: e.target.checked } })} />
                  <span>Delaware Depository - Boulder</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.dakota} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, dakota: e.target.checked } })} />
                  <span>Dakota Depository</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.milesFranklin} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, milesFranklin: e.target.checked } })} />
                  <span>Miles Franklin</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.amglLasVegas} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, amglLasVegas: e.target.checked } })} />
                  <span>AMGL - Las Vegas</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.amglIrving} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, amglIrving: e.target.checked } })} />
                  <span>AMGL - Irving</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.idahoArmored} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, idahoArmored: e.target.checked } })} />
                  <span>Idaho Armored</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.cnt} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, cnt: e.target.checked } })} />
                  <span>CNT</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.brinksLA} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, brinksLA: e.target.checked } })} />
                  <span>Brinks - Los Angeles</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.brinksSaltLake} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, brinksSaltLake: e.target.checked } })} />
                  <span>Brinks - Salt Lake City</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.depository.brinksJFK} onChange={(e) => setSellData({ ...sellData, depository: { ...sellData.depository, brinksJFK: e.target.checked } })} />
                  <span>Brinks - JFK International</span>
                </label>
              </div>
            </div>

            {/* Fee Payment Method */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Fee Payment Method</h3>
              <div className={styles.checkboxGrid}>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.feePayment.payWithCash} onChange={(e) => setSellData({ ...sellData, feePayment: { ...sellData.feePayment, payWithCash: e.target.checked } })} />
                  <span>Pay with cash from asset sale</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.feePayment.creditCard} onChange={(e) => setSellData({ ...sellData, feePayment: { ...sellData.feePayment, creditCard: e.target.checked } })} />
                  <span>Credit Card (complete Section 7)</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={sellData.feePayment.thirdPartyBilling} onChange={(e) => setSellData({ ...sellData, feePayment: { ...sellData.feePayment, thirdPartyBilling: e.target.checked } })} />
                  <span>Third Party Billing</span>
                </label>
                <div className={styles.upsOption}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={sellData.feePayment.fedex} onChange={(e) => setSellData({ ...sellData, feePayment: { ...sellData.feePayment, fedex: e.target.checked } })} />
                    <span>FedEx</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={sellData.feePayment.ups} onChange={(e) => setSellData({ ...sellData, feePayment: { ...sellData.feePayment, ups: e.target.checked } })} />
                    <span>UPS</span>
                  </label>
                  {(sellData.feePayment.fedex || sellData.feePayment.ups) && (
                    <input
                      type="text"
                      className={styles.upsAccountInput}
                      value={sellData.feePayment.accountNumber}
                      onChange={(e) => setSellData({ ...sellData, feePayment: { ...sellData.feePayment, accountNumber: e.target.value } })}
                      placeholder="Account #"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Credit Card Information */}
            {sellData.feePayment.creditCard && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Credit Card Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Name on Card"
                    value={sellData.creditCard.nameOnCard}
                    onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, nameOnCard: e.target.value } })}
                    style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label className={styles.checkboxLabel}>
                      <input type="radio" name="cardType" checked={sellData.creditCard.cardType === 'visa'} onChange={() => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, cardType: 'visa' } })} />
                      <span>Visa</span>
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input type="radio" name="cardType" checked={sellData.creditCard.cardType === 'mastercard'} onChange={() => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, cardType: 'mastercard' } })} />
                      <span>MC</span>
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input type="radio" name="cardType" checked={sellData.creditCard.cardType === 'amex'} onChange={() => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, cardType: 'amex' } })} />
                      <span>Amex</span>
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input type="radio" name="cardType" checked={sellData.creditCard.cardType === 'discover'} onChange={() => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, cardType: 'discover' } })} />
                      <span>Disc</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Credit Card Number"
                    value={sellData.creditCard.cardNumber}
                    onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, cardNumber: e.target.value } })}
                    style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Expiration Date (MM/YY)"
                    value={sellData.creditCard.expirationDate}
                    onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, expirationDate: e.target.value } })}
                    style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Billing Street Address"
                    value={sellData.creditCard.billingStreet}
                    onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, billingStreet: e.target.value } })}
                    style={{ gridColumn: 'span 2', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <input
                    type="text"
                    placeholder="Billing City"
                    value={sellData.creditCard.billingCity}
                    onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, billingCity: e.target.value } })}
                    style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="State"
                      value={sellData.creditCard.billingState}
                      onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, billingState: e.target.value } })}
                      style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                    />
                    <input
                      type="text"
                      placeholder="Zip"
                      value={sellData.creditCard.billingZip}
                      onChange={(e) => setSellData({ ...sellData, creditCard: { ...sellData.creditCard, billingZip: e.target.value } })}
                      style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.previewBtn}
            onClick={() => setShowPreview(true)}
          >
            Preview & Download
          </button>
        </div>
      </div>

      {/* Preview Modal with Tabs */}
      {showPreview && (
        <div className={styles.modalOverlay} onClick={() => setShowPreview(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.previewTabs}>
                <button
                  className={`${styles.previewTab} ${previewTab === 'invoice' ? styles.previewTabActive : ''}`}
                  onClick={() => setPreviewTab('invoice')}
                >
                  Invoice
                </button>
                <button
                  className={`${styles.previewTab} ${previewTab === 'buyDirection' ? styles.previewTabActive : ''}`}
                  onClick={() => setPreviewTab('buyDirection')}
                >
                  Buy Direction
                </button>
                {isBuyAndSell && (
                  <button
                    className={`${styles.previewTab} ${previewTab === 'sellDirection' ? styles.previewTabActive : ''}`}
                    onClick={() => setPreviewTab('sellDirection')}
                  >
                    Sell Direction
                  </button>
                )}
                <button
                  className={`${styles.previewTab} ${previewTab === 'combined' ? styles.previewTabActive : ''}`}
                  onClick={() => setPreviewTab('combined')}
                >
                  Combined
                </button>
              </div>
              <div className={styles.previewActions}>
                <button
                  className={styles.downloadBtn}
                  onClick={
                    previewTab === 'invoice' ? generatePDF :
                    previewTab === 'buyDirection' ? generateBuyDirectionLetter :
                    previewTab === 'sellDirection' ? generateSellDirectionLetter :
                    generateCombinedDocument
                  }
                  disabled={isGenerating || isGeneratingBuyDirection}
                >
                  {isGenerating || isGeneratingBuyDirection ? 'Downloading...' : 'Download PDF'}
                </button>
                <button
                  className={styles.closeBtn}
                  onClick={() => setShowPreview(false)}
                >
                  &times;
                </button>
              </div>
            </div>
            <div className={styles.previewContainer}>
              {/* Invoice Preview */}
              {previewTab === 'invoice' && (
                <div ref={previewInvoiceRef} className={styles.invoice}>
                  <div className={styles.invoiceHeader}>
                    <div className={styles.logoContainer}>
                      <img src="/citadel-gold-logo.png" alt="Citadel Gold" className={styles.logo} />
                    </div>
                    <h1 className={styles.invoiceTitle}>CITADEL GOLD INVOICE</h1>
                  </div>
                  <div className={styles.goldBar}></div>
                  <div className={styles.invoiceBody}>
                    <div className={styles.dateSection}>
                      <span className={styles.dateLabel}>{invoiceData.date}</span>
                    </div>
                    <div className={styles.infoSection}>
                      <div className={styles.clientInfo}>
                        <p><strong>Client Name</strong> {invoiceData.clientName}</p>
                        <p><strong>Acct. Number</strong> {invoiceData.acctNumber}</p>
                        <p><strong>Acct. Rep.</strong> {invoiceData.acctRep}</p>
                        {invoiceData.acctRep2 && <p><strong>Acct. Rep.</strong> {invoiceData.acctRep2}</p>}
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
                    <div className={styles.tableContainer}>
                      <div className={styles.tableHeader}>
                        <span className={styles.thProduct}>PRODUCT NAME</span>
                        <span className={styles.thQty}>QTY</span>
                        <span className={styles.thPrice}>LIST PRICE</span>
                        <span className={styles.thTotal}>TOTAL</span>
                      </div>
                      {displayItems.map((item, index) => (
                        <div key={item.id} className={`${styles.tableRow} ${index % 2 === 0 ? styles.tableRowWhite : styles.tableRowGold}`}>
                          <span className={styles.tdProduct}>{item.productName}</span>
                          <span className={styles.tdQty}>{item.qty}</span>
                          <span className={styles.tdPrice}>{item.listPrice ? formatCurrency(parseFloat(item.listPrice.replace(/[^0-9.-]/g, "")) || 0) : ""}</span>
                          <span className={styles.tdTotal}>{item.qty && item.listPrice ? formatCurrency(calculateLineTotal(item.qty, item.listPrice)) : ""}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.grandTotalRow}>
                      <div className={styles.grandTotalBox}>
                        <span>GRAND TOTAL : </span>
                        <span>{formatCurrency(calculateGrandTotal())}</span>
                      </div>
                    </div>
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
                    <div className={styles.shippingInfo}>
                      <p>Shipping Information: Orders may take up to 28 days to arrive, as outlined by our wholesalers' timeline, to account for potential product shortages and unforeseen shipping delays. Most shipments are fully insured, require a signature upon delivery, and typically arrive within 7 business days via UPS, FedEx, or USPS. Tracking details will be provided once your order is packaged and ready for shipment.</p>
                    </div>
                    <div className={styles.tagline}>
                      <p>Fortifying Your Future One Precious Metal at a Time</p>
                    </div>
                  </div>
                  <div className={styles.invoiceFooter}>
                    <div className={styles.footerLogo}>
                      <img src="/citadel-gold-logo.png" alt="Citadel Gold" className={styles.footerLogoImg} />
                    </div>
                    <div className={styles.footerContact}>
                      <p><strong>Phone:</strong> 310-209.8166 | <strong>Email:</strong> info@citadelgold.com</p>
                      <p><strong>Website:</strong> www.citadelgold.com</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Buy Direction Letter Preview */}
              {previewTab === 'buyDirection' && (
                <div ref={previewBuyDirectionRef}>
                  {/* Purchase Instructions Pages - 5 items per page */}
                  {chunkArray(displayItems, 5).map((itemChunk, chunkIndex, allChunks) => (
                    <div key={`bdl-page-${chunkIndex}`} className={chunkIndex === 0 ? styles.bdl : styles.bdlPage2}>
                      <div className={styles.bdlHeader}>
                        <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
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
                              <td className={styles.bdlCell} colSpan={2}>
                                <div className={styles.bdlCellLabel}>DEALER ADDRESS</div>
                                <div className={styles.bdlCellValue}>10433 Wilshire Blvd #1002 Los Angeles, California 90024</div>
                              </td>
                            </tr>
                            <tr>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>PHONE NUMBER</div>
                                <div className={styles.bdlCellValue}>310-209-8166</div>
                              </td>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>FAX</div>
                                <div className={styles.bdlCellValue}>310-209-8255</div>
                              </td>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>REPRESENTATIVE</div>
                                <div className={styles.bdlCellValue}>Shaun Bina</div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className={styles.bdlAuthSection}>
                        <div className={styles.bdlAuthText}>
                          <strong>By initialing, I authorize the administrator to accept completion of transaction details for the sections below from the dealer listed in Section 2, without my verification. I understand that Entrust will advise the dealer of this authorization and the funds in the IRA, and will await confirmation from the dealer.</strong>
                        </div>
                        <div className={styles.bdlInitialBox}>
                          <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                          <div className={styles.bdlInitialSpace}></div>
                        </div>
                      </div>
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
                              <span>OVERNIGHT CHECK <span className={styles.bdlCheckNote}>($30 fee applies; cannot overnight to a PO Box. Also,<br/><span style={{display: 'block', textAlign: 'center'}}>invoice must be attached)</span></span></span>
                            </div>
                            <div className={styles.bdlCheckItem}>
                              <span className={styles.bdlCheckBox}>{paymentOptions.chargeEntrustAccount ? "X" : ""}</span>
                              <span>Charge my Entrust Account</span>
                            </div>
                            <div className={styles.bdlCheckItem}>
                              <span className={styles.bdlCheckBox}>{paymentOptions.thirdPartyBilling ? "X" : ""}</span>
                              <span>Use third-party billing</span>
                            </div>
                            <div className={styles.bdlCheckItem} style={{marginLeft: '20px', display: 'flex', alignItems: 'baseline'}}>
                              <span className={styles.bdlCheckBox}>{paymentOptions.fedex ? "X" : ""}</span>
                              <span>FedEx</span>
                              <span className={styles.bdlCheckBox} style={{marginLeft: '12px'}}>{paymentOptions.ups ? "X" : ""}</span>
                              <span>UPS</span>
                              <span style={{marginLeft: '8px', whiteSpace: 'nowrap'}}>Account #:</span>
                              <span className={styles.bdlUpsLine}>{paymentOptions.upsAccountNumber}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className={styles.bdlSection}>
                        <div className={styles.bdlSectionHeader}>
                          <div className={styles.bdlSectionNum}>4</div>
                          <div className={styles.bdlSectionTitle}>Purchase Instructions {allChunks.length > 1 ? `(Page ${chunkIndex + 1} of ${allChunks.length})` : ''}</div>
                        </div>
                        <div className={styles.bdlPurchaseIntro}>
                          <strong>I hereby direct the administrator and/or custodian to BUY the following asset(s) for my account:</strong>
                        </div>
                        <table className={styles.bdlPurchaseTable}>
                          <colgroup>
                            <col style={{width: '60px'}} />
                            <col style={{width: '70px'}} />
                            <col style={{width: '180px'}} />
                            <col style={{width: '60px'}} />
                            <col style={{width: '70px'}} />
                            <col style={{width: '90px'}} />
                            <col style={{width: '100px'}} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Quantity<br/><span className={styles.bdlThSub}>(number of units)</span></th>
                              <th>Metal Type</th>
                              <th>Asset Name or Description<br/><span className={styles.bdlThSub}>(U.S. Silver Eagle, 1oz.)</span></th>
                              <th>Proof Am.<br/>Eagle?</th>
                              <th>Troy OZ. Each</th>
                              <th>Price<br/><span className={styles.bdlThSub}>(per number of units)</span></th>
                              <th>Total Purchase Price<br/><span className={styles.bdlThSub}>(quantity times price)</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {itemChunk.map((item) => (
                              <tr key={`preview-bdl-${item.id}`}>
                                <td>{item.qty}</td>
                                <td>{item.productName?.split(' ')[0] || ''}</td>
                                <td>{item.productName}</td>
                                <td>{item.proofAmEagle ? 'Yes' : ''}</td>
                                <td>{item.troyOzEach || ''}</td>
                                <td>$ {item.listPrice ? parseFloat(String(item.listPrice).replace(/[^0-9.]/g, "")).toFixed(2) : ''}</td>
                                <td>$ {item.qty && item.listPrice ? calculateLineTotal(item.qty, item.listPrice).toFixed(2) : ''}</td>
                              </tr>
                            ))}
                            {Array.from({ length: Math.max(0, 5 - itemChunk.length) }).map((_, idx) => (
                              <tr key={`preview-empty-${chunkIndex}-${idx}`}>
                                <td></td><td></td><td></td><td></td><td></td><td>$</td><td>$</td>
                              </tr>
                            ))}
                            {/* Only show totals on the last page */}
                            {chunkIndex === allChunks.length - 1 && (
                              <tr className={styles.bdlSpecialRow}>
                                <td colSpan={5} style={{textAlign: 'left'}}><strong>Special Instructions:</strong></td>
                                <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                                <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                              </tr>
                            )}
                            {chunkIndex === allChunks.length - 1 && calculateGrandTotal() > 0 && (
                              <tr>
                                <td colSpan={5}></td>
                                <td style={{textAlign: 'right'}}>$ {calculateGrandTotal().toFixed(2)}</td>
                                <td style={{textAlign: 'right'}}>$ {calculateGrandTotal().toFixed(2)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className={styles.bdlFooter}>
                        <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
                      </div>
                    </div>
                  ))}

                  {/* Page 2 - Signature sections */}
                  <div className={styles.bdlPage2}>
                    <div className={styles.bdlHeader}>
                      <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
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

                    {/* Section 5: Depository Information */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>5</div>
                        <div className={styles.bdlSectionTitle}>Depository Information</div>
                      </div>
                      <table className={styles.bdlFormTable} style={{tableLayout: 'fixed', borderBottom: 'none'}}>
                        <colgroup>
                          <col style={{width: '33.33%'}} />
                          <col style={{width: '33.33%'}} />
                          <col style={{width: '33.33%'}} />
                        </colgroup>
                        <tbody>
                          <tr>
                            <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                              <div className={styles.bdlCellLabel}>DEPOSITORY NAME</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.depositoryName}</div>
                            </td>
                            <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                              <div className={styles.bdlCellLabel}>CONTACT NAME</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.contactName}</div>
                            </td>
                            <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                              <div className={styles.bdlCellLabel}>CONTACT PHONE NUMBER</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.contactPhone}</div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <table className={styles.bdlFormTable} style={{tableLayout: 'fixed', borderTop: 'none'}}>
                        <colgroup>
                          <col style={{width: '50%'}} />
                          <col style={{width: '25%'}} />
                          <col style={{width: '10%'}} />
                          <col style={{width: '15%'}} />
                        </colgroup>
                        <tbody>
                          <tr>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>DEPOSITORY STREET ADDRESS</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.streetAddress}</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>CITY</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.city}</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>STATE</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.state}</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>ZIP CODE</div>
                              <div className={styles.bdlCellValue}>{depositoryInfo.zipCode}</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell} colSpan={4} style={{padding: '3px 8px', height: 'auto'}}>
                              <div className={styles.bdlCheckItem} style={{margin: 0, display: 'flex', alignItems: 'center', gap: '6px'}}>
                                <span className={styles.bdlCheckBox} style={{width: '10px', height: '10px', minWidth: '10px'}}>{depositoryInfo.storageAgreementAttached ? "X" : ""}</span>
                                <span className={styles.bdlCellLabel}>DEPOSITORY STORAGE AGREEMENT ATTACHED</span>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className={styles.bdlAuthSection} style={{marginTop: '-1px'}}>
                        <div className={styles.bdlAuthText}>
                          <strong>By initialing, I acknowledge the following: There are numerous depositories that specialize in storage and safekeeping of precious metals. I understand that the Administrator and/or Custodian is not and cannot be held responsible for the actions of these depositories. I hereby release and hold harmless the Administrator/Custodian from any damages that I may incur with respect to my choice of depository and any activities or lack of activities on the part of said depository.</strong>
                        </div>
                        <div className={styles.bdlInitialBox} style={{height: '50.63px'}}>
                          <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                          <div className={styles.bdlInitialSpace}></div>
                        </div>
                      </div>
                    </div>

                    {/* Section 6: Account Owner Signature */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader} style={{marginBottom: '16.33px'}}>
                        <div className={styles.bdlSectionNum}>6</div>
                        <div className={styles.bdlSectionTitle}>Account Owner Signature and Investment Acknowledgment</div>
                      </div>
                      <div className={styles.bdlLegalText}>
                        <p className={styles.bdlLegalBold}><em>Prior to funding, all transaction documents must be notated "read and approved" with your signature and date</em> <span style={{fontSize: '9.98px'}}>(for example, precious metals invoice).</span></p>

                        <p>I understand that my account is self-directed and that the Administrator and Custodian named in the disclosure statement received when the account was established will not review the merits, legitimacy, appropriateness and/or suitability of any investment in general, including, but not limited to, any investigation and/or due diligence prior to making any investment, or in connection with my account in particular. I acknowledge that I have not requested that the Administrator and/or Custodian provide, and the Administrator and/or Custodian have not provided, any advice with respect to the investment directive set forth in this Buy Direction Letter. I understand that it is my responsibility to conduct all due diligence, but not limited to, search concerning the validity of title, and all other investigation that a reasonably prudent investor would undertake prior to making any investment. I understand that neither the Administrator nor the Custodian determine whether this investment is acceptable under the Employee Retirement Income Securities Act (ERISA), the Internal Revenue Code (IRC), or any applicable federal, state, or local laws, including securities laws. I understand that it is my responsibility to review any investments to ensure compliance with these requirements, including but not limited to investments that engage in Marijuana-related business activities.</p>

                        <p>I understand that neither the Administrator nor the Custodian is a "fiduciary" for my account and/or my investment as such terms are defined in the IRC, ERISA, and/or any applicable federal, state or local laws. I agree to release, indemnify, defend and hold the Administrator and/or Custodian harmless from any claims, including, but not limited to, actions, liabilities, losses, penalties, fines and/or claims by others, arising out of this Buy Direction Letter and/or this investment, including, but not limited to, claims that an investment is not prudent, proper, diversified or otherwise in compliance with ERISA, the IRC and/or any other applicable federal, state or local laws. In the event of claims by others related to my account and/or investment wherein Administrator and/or Custodian are named as a party, Administrator and/or Custodian shall have the full and unequivocal right at their sole discretion to select their own attorneys to represent them in such litigation and deduct from my account any amounts to pay for any costs and expenses, including, but not limited to, all attorneys' fees, and costs and internal costs (collectively "Litigation Costs"), incurred by Administrator and/or Custodian in the defense of such claims and/or litigation. If there are insufficient funds in my account to cover the Litigation Costs incurred by Administrator and/or Custodian, on demand by Administrator and/ or Custodian, I will promptly reimburse Administrator and/or Custodian the outstanding balance of the Litigation Costs. If I fail to promptly reimburse the Litigation Costs, Administrator and/or Custodian shall have the full and unequivocal right to freeze my assets, liquidate my assets, and/or initiate legal action in order to obtain full reimbursement of the Litigation Costs. I also understand and agree that the Administrator and/or Custodian will not be responsible to take any action should there be any default with regard to this investment.</p>

                        <p>I am directing you to complete this transaction as specified above. I confirm that the decision to buy this asset is in accordance with the rules of my account, and I agree to hold harmless and without liability the Administrator and/or Custodian of my account under the foregoing hold harmless provision. I understand that no one at the Administrator and/or Custodian has authority to agree to anything different than my foregoing understandings of Administrator's and/or Custodian's policy. If any provision of this Buy Direction Letter is found to be illegal, invalid, void or unenforceable, such provision shall be severed and such illegality or invalidity shall not affect the remaining provisions, which shall remain in full force and effect. For purposes of this Buy-Direction Letter, the terms Administrator and Custodian include The Entrust Group, its agents, assigns, joint ventures, affiliates and/or business associates, former and present. I declare that I have examined this document, including accompanying information, and to the best of my knowledge and belief, it is true, correct and complete.</p>

                        <p><strong>Not responsible for Market Condition Variances:</strong> I understand that I have agreed and instructed the Custodian to follow the investment direction which I provide to Administrator in investing the principal, as confirmed by written direction letters or instructions to Administrator from the undersigned for the above-referenced Account or other Custodial account for which Administrator serves as record keeper. I further understand that for any transaction that I may direct or instruct Administrator to complete, especially precious metals, that may be dependent upon the operation of global markets and entities, there could be fluctuations in price and condition of said investments from the time that I issue a direction letter to Administrator and the time when the transaction can actually be completed and recorded in my Account. I hereby agree to release, indemnify, defend and hold Administrator and Custodian harmless from any claims regarding the fluctuation in prices and/or conditions of any transaction I direct or instruct Administrator to make on my behalf. I further agree to waive any claims that I have, past, present or future, known or unknown, anticipated or unanticipated, with respect to the fluctuation or change in the price or condition of any investment that I direct or instruct Administrator to make from the time I deliver my direction or instruction letter to Administrator until the time the transaction is actually completed and recorded to my Account. I understand that this hold harmless and release shall apply equally to the Administrator and Custodian.</p>

                        <p style={{marginTop: '16px'}}><strong>I understand that my account is subject to the provisions of Internal Revenue Code (IRC) §4975, which defines certain prohibited transactions.</strong> I acknowledge that neither the Administrator nor the Custodian has made or will make any determination as to whether this investment is prohibited under IRC §4975 or under any other federal, state or local law. I certify that making this investment will not constitute a prohibited transaction and that it complies with all applicable federal, state, and local laws, regulations and requirements.</p>

                        <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>Transactions with insufficient funds will not be processed until sufficient funds are received. If fees are being deducted from your account, the full amount of the transaction plus fees must be available before your transaction can be processed.</em></p>

                        <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>I have read and understand the disclosure above.</em></p>
                      </div>
                      <table className={styles.bdlFormTable} style={{marginTop: '18px'}}>
                        <tbody>
                          <tr>
                            <td className={styles.bdlCell} style={{width: '60%', height: '33px'}}>
                              <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>SIGNATURE</div>
                              <div className={styles.bdlCellValue}></div>
                            </td>
                            <td className={styles.bdlCell} style={{width: '40%', height: '33px'}}>
                              <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>DATE</div>
                              <div className={styles.bdlCellValue}></div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.bdlFooter}>
                      <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sell Direction Letter Preview */}
              {previewTab === 'sellDirection' && (
                <div ref={previewSellDirectionRef}>
                  {/* Page 1 */}
                  <div className={styles.bdl}>
                    <div className={styles.bdlHeader}>
                      <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
                      <div className={styles.bdlHeaderCenter}>
                        <div className={styles.bdlHeaderTitle}>Precious Metals</div>
                        <div className={styles.bdlHeaderSubtitle}>Sell Direction Letter</div>
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
                            <td className={styles.bdlCell} colSpan={2}>
                              <div className={styles.bdlCellLabel}>DEALER ADDRESS</div>
                              <div className={styles.bdlCellValue}>10433 Wilshire Blvd #1002 Los Angeles, California 90024</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>PHONE NUMBER</div>
                              <div className={styles.bdlCellValue}>310-209-8166</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>FAX</div>
                              <div className={styles.bdlCellValue}>310-209-8255</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>REPRESENTATIVE</div>
                              <div className={styles.bdlCellValue}>Shaun Bina</div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Authorization Text */}
                    <div className={styles.bdlAuthSection}>
                      <div className={styles.bdlAuthText}>
                        <strong>By initialing, I authorize the administrator to accept completion of transaction details for the sections below from the dealer listed in Section 2, without my verification. I understand that Entrust will advise the dealer of this authorization and the funds in the IRA, and will await confirmation from the dealer.</strong>
                      </div>
                      <div className={styles.bdlInitialBox}>
                        <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                        <div className={styles.bdlInitialSpace}></div>
                      </div>
                    </div>

                    {/* Section 3: Sell Instructions */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>3</div>
                        <div className={styles.bdlSectionTitle}>Sell Instructions</div>
                      </div>
                      <div className={styles.bdlPurchaseIntro}>
                        <strong>I hereby direct the administrator and/or custodian to SELL the following asset(s) from my account:</strong>
                      </div>
                      <table className={styles.bdlPurchaseTable}>
                        <colgroup>
                          <col style={{width: '60px'}} />
                          <col style={{width: '70px'}} />
                          <col style={{width: '180px'}} />
                          <col style={{width: '60px'}} />
                          <col style={{width: '70px'}} />
                          <col style={{width: '90px'}} />
                          <col style={{width: '100px'}} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Quantity<br/><span className={styles.bdlThSub}>(number of units)</span></th>
                            <th>Metal Type</th>
                            <th>Asset Name or Description<br/><span className={styles.bdlThSub}>(U.S. Silver Eagle, 1oz.)</span></th>
                            <th>Proof Am.<br/>Eagle?</th>
                            <th>Troy OZ. Each</th>
                            <th>Price<br/><span className={styles.bdlThSub}>(per number of units)</span></th>
                            <th>Total Sell Price<br/><span className={styles.bdlThSub}>(quantity times price)</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellData.lineItems.map((item) => (
                            <tr key={`preview-sell-${item.id}`}>
                              <td>{item.quantity}</td>
                              <td>{item.metalType}</td>
                              <td>{item.description}</td>
                              <td>{item.proofAm}</td>
                              <td>{item.troyOz}</td>
                              <td>$ {item.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, "")).toFixed(2) : ''}</td>
                              <td>$ {item.quantity && item.price ? (parseFloat(item.quantity) * parseFloat(String(item.price).replace(/[^0-9.]/g, ""))).toFixed(2) : ''}</td>
                            </tr>
                          ))}
                          {Array.from({ length: Math.max(0, 5 - sellData.lineItems.length) }).map((_, idx) => (
                            <tr key={`preview-sell-empty-${idx}`}>
                              <td></td><td></td><td></td><td></td><td></td><td>$</td><td>$</td>
                            </tr>
                          ))}
                          <tr className={styles.bdlSpecialRow}>
                            <td colSpan={5} style={{textAlign: 'left'}}><strong>Special Instructions:</strong> {sellData.specialInstructions}</td>
                            <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                            <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                          </tr>
                          {calculateSellGrandTotal() > 0 && (
                            <tr>
                              <td colSpan={5}></td>
                              <td style={{textAlign: 'right'}}>$ {calculateSellGrandTotal().toFixed(2)}</td>
                              <td style={{textAlign: 'right'}}>$ {calculateSellGrandTotal().toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Section 4: Delivery Instructions */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>4</div>
                        <div className={styles.bdlSectionTitle}>Delivery Instructions</div>
                      </div>
                      <table className={styles.bdlFormTable}>
                        <tbody>
                          <tr>
                            <td className={styles.bdlCell} style={{width: '50%'}}>
                              <div className={styles.bdlCellLabel}>DEALER / DEPOSITORY / RECIPIENT NAME</div>
                              <div className={styles.bdlCellValue}>{sellData.deliveryRecipient}</div>
                            </td>
                            <td className={styles.bdlCell} style={{width: '50%'}}>
                              <div className={styles.bdlCellLabel}>SUB-ACCOUNT NUMBER</div>
                              <div className={styles.bdlCellValue}>{sellData.subAccountNumber}</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell} colSpan={2}>
                              <div className={styles.bdlCellLabel}>STREET ADDRESS</div>
                              <div className={styles.bdlCellValue}>{sellData.shippingStreet}</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>CITY</div>
                              <div className={styles.bdlCellValue}>{sellData.shippingCity}</div>
                            </td>
                            <td className={styles.bdlCell} style={{display: 'flex', gap: '0'}}>
                              <div style={{flex: 1, borderRight: '1px solid #808181', padding: '3px 8px'}}>
                                <div className={styles.bdlCellLabel}>STATE</div>
                                <div className={styles.bdlCellValue}>{sellData.shippingState}</div>
                              </div>
                              <div style={{flex: 1, padding: '3px 8px'}}>
                                <div className={styles.bdlCellLabel}>ZIP CODE</div>
                                <div className={styles.bdlCellValue}>{sellData.shippingZip}</div>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.bdlFooter}>
                      <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Sell Direction Letter</div>
                    </div>
                  </div>

                  {/* Page 2 */}
                  <div className={styles.bdlPage2}>
                    <div className={styles.bdlHeader}>
                      <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
                      <div className={styles.bdlHeaderCenter}>
                        <div className={styles.bdlHeaderTitle}>Precious Metals</div>
                        <div className={styles.bdlHeaderSubtitle}>Sell Direction Letter</div>
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

                    {/* Section 5: Current Depository Storage Location */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>5</div>
                        <div className={styles.bdlSectionTitle}>Current Depository Storage Location <span className={styles.bdlSelectOne}>(select one)</span></div>
                      </div>
                      <div className={styles.bdlPaymentGrid} style={{flexWrap: 'wrap', minHeight: 'auto'}}>
                        <div style={{width: '50%', padding: '10px 12px'}}>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.delawareWilmington ? "X" : ""}</span>
                            <span>Delaware Depository - Wilmington</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.delawareBoulder ? "X" : ""}</span>
                            <span>Delaware Depository - Boulder</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.dakota ? "X" : ""}</span>
                            <span>Dakota Depository</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.milesFranklin ? "X" : ""}</span>
                            <span>Miles Franklin</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.amglLasVegas ? "X" : ""}</span>
                            <span>AMGL - Las Vegas</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.amglIrving ? "X" : ""}</span>
                            <span>AMGL - Irving</span>
                          </div>
                        </div>
                        <div style={{width: '50%', padding: '10px 12px'}}>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.idahoArmored ? "X" : ""}</span>
                            <span>Idaho Armored</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.cnt ? "X" : ""}</span>
                            <span>CNT</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.brinksLA ? "X" : ""}</span>
                            <span>Brinks - Los Angeles</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.brinksSaltLake ? "X" : ""}</span>
                            <span>Brinks - Salt Lake City</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depository.brinksJFK ? "X" : ""}</span>
                            <span>Brinks - JFK International</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 6: Deposit Method */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>6</div>
                        <div className={styles.bdlSectionTitle}>Deposit Method <span className={styles.bdlSelectOne}>(select one)</span></div>
                      </div>
                      <div className={styles.bdlPaymentGrid}>
                        <div className={styles.bdlPaymentLeft}>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depositMethod.wire ? "X" : ""}</span>
                            <span>WIRE <span className={styles.bdlCheckNote}>($30 fee)</span></span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depositMethod.ach ? "X" : ""}</span>
                            <span>ACH</span>
                          </div>
                        </div>
                        <div className={styles.bdlPaymentRight}>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depositMethod.check ? "X" : ""}</span>
                            <span>CHECK</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.depositMethod.overnightCheck ? "X" : ""}</span>
                            <span>OVERNIGHT CHECK <span className={styles.bdlCheckNote}>($30 fee)</span></span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 7: Fee Payment Method */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>7</div>
                        <div className={styles.bdlSectionTitle}>Fee Payment Method <span className={styles.bdlSelectOne}>(select one)</span></div>
                      </div>
                      <div className={styles.bdlPaymentGrid}>
                        <div className={styles.bdlPaymentLeft}>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.feePayment.payWithCash ? "X" : ""}</span>
                            <span>Pay with cash from asset sale</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.feePayment.creditCard ? "X" : ""}</span>
                            <span>Credit Card <span className={styles.bdlCheckNote}>(complete Section 8)</span></span>
                          </div>
                        </div>
                        <div className={styles.bdlPaymentRight}>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{sellData.feePayment.thirdPartyBilling ? "X" : ""}</span>
                            <span>Use third-party billing</span>
                          </div>
                          <div className={styles.bdlCheckItem} style={{marginLeft: '20px', display: 'flex', alignItems: 'baseline'}}>
                            <span className={styles.bdlCheckBox}>{sellData.feePayment.fedex ? "X" : ""}</span>
                            <span>FedEx</span>
                            <span className={styles.bdlCheckBox} style={{marginLeft: '12px'}}>{sellData.feePayment.ups ? "X" : ""}</span>
                            <span>UPS</span>
                            <span style={{marginLeft: '8px', whiteSpace: 'nowrap'}}>Account #:</span>
                            <span className={styles.bdlUpsLine}>{sellData.feePayment.accountNumber}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 8: Credit Card Information */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>8</div>
                        <div className={styles.bdlSectionTitle}>Credit Card Information</div>
                      </div>
                      <table className={styles.bdlFormTable}>
                        <tbody>
                          <tr>
                            <td className={styles.bdlCell} style={{width: '50%'}}>
                              <div className={styles.bdlCellLabel}>NAME ON CARD</div>
                              <div className={styles.bdlCellValue}>{sellData.creditCard.nameOnCard}</div>
                            </td>
                            <td className={styles.bdlCell} style={{width: '50%'}}>
                              <div className={styles.bdlCellLabel}>CARD TYPE</div>
                              <div className={styles.bdlCellValue} style={{display: 'flex', gap: '15px', paddingTop: '4px'}}>
                                <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                  <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'visa' ? "X" : ""}</span>
                                  <span>Visa</span>
                                </span>
                                <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                  <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'mastercard' ? "X" : ""}</span>
                                  <span>MC</span>
                                </span>
                                <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                  <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'amex' ? "X" : ""}</span>
                                  <span>Amex</span>
                                </span>
                                <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                  <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'discover' ? "X" : ""}</span>
                                  <span>Disc</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>CREDIT CARD NUMBER</div>
                              <div className={styles.bdlCellValue}>{sellData.creditCard.cardNumber}</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>EXPIRATION DATE</div>
                              <div className={styles.bdlCellValue}>{sellData.creditCard.expirationDate}</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell} colSpan={2}>
                              <div className={styles.bdlCellLabel}>BILLING ADDRESS</div>
                              <div className={styles.bdlCellValue}>{sellData.creditCard.billingStreet}</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>CITY</div>
                              <div className={styles.bdlCellValue}>{sellData.creditCard.billingCity}</div>
                            </td>
                            <td className={styles.bdlCell} style={{display: 'flex', gap: '0'}}>
                              <div style={{flex: 1, borderRight: '1px solid #808181', padding: '3px 8px'}}>
                                <div className={styles.bdlCellLabel}>STATE</div>
                                <div className={styles.bdlCellValue}>{sellData.creditCard.billingState}</div>
                              </div>
                              <div style={{flex: 1, padding: '3px 8px'}}>
                                <div className={styles.bdlCellLabel}>ZIP CODE</div>
                                <div className={styles.bdlCellValue}>{sellData.creditCard.billingZip}</div>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.bdlFooter}>
                      <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Sell Direction Letter</div>
                    </div>
                  </div>

                  {/* Page 3 */}
                  <div className={styles.bdlPage2}>
                    <div className={styles.bdlHeader}>
                      <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
                      <div className={styles.bdlHeaderCenter}>
                        <div className={styles.bdlHeaderTitle}>Precious Metals</div>
                        <div className={styles.bdlHeaderSubtitle}>Sell Direction Letter</div>
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

                    {/* Section 9: Account Owner Signature and Investment Acknowledgment */}
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader} style={{marginBottom: '16.33px'}}>
                        <div className={styles.bdlSectionNum}>9</div>
                        <div className={styles.bdlSectionTitle}>Account Owner Signature and Investment Acknowledgment</div>
                      </div>
                      <div className={styles.bdlLegalText}>
                        <p className={styles.bdlLegalBold}><em>Prior to funding, all transaction documents must be notated "read and approved" with your signature and date</em> <span style={{fontSize: '9.98px'}}>(for example, precious metals invoice).</span></p>

                        <p>I understand that my account is self-directed and that the Administrator and Custodian named in the disclosure statement received when the account was established will not review the merits, legitimacy, appropriateness and/or suitability of any investment in general, including, but not limited to, any investigation and/or due diligence prior to making any investment, or in connection with my account in particular. I acknowledge that I have not requested that the Administrator and/or Custodian provide, and the Administrator and/or Custodian have not provided, any advice with respect to the investment directive set forth in this Sell Direction Letter. I understand that it is my responsibility to conduct all due diligence, but not limited to, search concerning the validity of title, and all other investigation that a reasonably prudent investor would undertake prior to making any investment. I understand that neither the Administrator nor the Custodian determine whether this investment is acceptable under the Employee Retirement Income Securities Act (ERISA), the Internal Revenue Code (IRC), or any applicable federal, state, or local laws, including securities laws. I understand that it is my responsibility to review any investments to ensure compliance with these requirements, including but not limited to investments that engage in Marijuana-related business activities.</p>

                        <p>I understand that neither the Administrator nor the Custodian is a "fiduciary" for my account and/or my investment as such terms are defined in the IRC, ERISA, and/or any applicable federal, state or local laws. I agree to release, indemnify, defend and hold the Administrator and/or Custodian harmless from any claims, including, but not limited to, actions, liabilities, losses, penalties, fines and/or claims by others, arising out of this Sell Direction Letter and/or this investment, including, but not limited to, claims that an investment is not prudent, proper, diversified or otherwise in compliance with ERISA, the IRC and/or any other applicable federal, state or local laws. In the event of claims by others related to my account and/or investment wherein Administrator and/or Custodian are named as a party, Administrator and/or Custodian shall have the full and unequivocal right at their sole discretion to select their own attorneys to represent them in such litigation and deduct from my account any amounts to pay for any costs and expenses, including, but not limited to, all attorneys' fees, and costs and internal costs (collectively "Litigation Costs"), incurred by Administrator and/or Custodian in the defense of such claims and/or litigation. If there are insufficient funds in my account to cover the Litigation Costs incurred by Administrator and/or Custodian, on demand by Administrator and/ or Custodian, I will promptly reimburse Administrator and/or Custodian the outstanding balance of the Litigation Costs. If I fail to promptly reimburse the Litigation Costs, Administrator and/or Custodian shall have the full and unequivocal right to freeze my assets, liquidate my assets, and/or initiate legal action in order to obtain full reimbursement of the Litigation Costs. I also understand and agree that the Administrator and/or Custodian will not be responsible to take any action should there be any default with regard to this investment.</p>

                        <p>I am directing you to complete this transaction as specified above. I confirm that the decision to sell this asset is in accordance with the rules of my account, and I agree to hold harmless and without liability the Administrator and/or Custodian of my account under the foregoing hold harmless provision. I understand that no one at the Administrator and/or Custodian has authority to agree to anything different than my foregoing understandings of Administrator's and/or Custodian's policy. If any provision of this Sell Direction Letter is found to be illegal, invalid, void or unenforceable, such provision shall be severed and such illegality or invalidity shall not affect the remaining provisions, which shall remain in full force and effect. For purposes of this Sell Direction Letter, the terms Administrator and Custodian include The Entrust Group, its agents, assigns, joint ventures, affiliates and/or business associates, former and present. I declare that I have examined this document, including accompanying information, and to the best of my knowledge and belief, it is true, correct and complete.</p>

                        <p><strong>Not responsible for Market Condition Variances:</strong> I understand that I have agreed and instructed the Custodian to follow the investment direction which I provide to Administrator in investing the principal, as confirmed by written direction letters or instructions to Administrator from the undersigned for the above-referenced Account or other Custodial account for which Administrator serves as record keeper. I further understand that for any transaction that I may direct or instruct Administrator to complete, especially precious metals, that may be dependent upon the operation of global markets and entities, there could be fluctuations in price and condition of said investments from the time that I issue a direction letter to Administrator and the time when the transaction can actually be completed and recorded in my Account. I hereby agree to release, indemnify, defend and hold Administrator and Custodian harmless from any claims regarding the fluctuation in prices and/or conditions of any transaction I direct or instruct Administrator to make on my behalf. I further agree to waive any claims that I have, past, present or future, known or unknown, anticipated or unanticipated, with respect to the fluctuation or change in the price or condition of any investment that I direct or instruct Administrator to make from the time I deliver my direction or instruction letter to Administrator until the time the transaction is actually completed and recorded to my Account. I understand that this hold harmless and release shall apply equally to the Administrator and Custodian.</p>

                        <p style={{marginTop: '16px'}}><strong>I understand that my account is subject to the provisions of Internal Revenue Code (IRC) §4975, which defines certain prohibited transactions.</strong> I acknowledge that neither the Administrator nor the Custodian has made or will make any determination as to whether this investment is prohibited under IRC §4975 or under any other federal, state or local law. I certify that making this investment will not constitute a prohibited transaction and that it complies with all applicable federal, state, and local laws, regulations and requirements.</p>

                        <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>Transactions with insufficient funds will not be processed until sufficient funds are received. If fees are being deducted from your account, the full amount of the transaction plus fees must be available before your transaction can be processed.</em></p>

                        <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>I have read and understand the disclosure above.</em></p>
                      </div>
                      <table className={styles.bdlFormTable} style={{marginTop: '18px'}}>
                        <tbody>
                          <tr>
                            <td className={styles.bdlCell} style={{width: '60%', height: '33px'}}>
                              <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>SIGNATURE</div>
                              <div className={styles.bdlCellValue}></div>
                            </td>
                            <td className={styles.bdlCell} style={{width: '40%', height: '33px'}}>
                              <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>DATE</div>
                              <div className={styles.bdlCellValue}></div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.bdlFooter}>
                      <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Sell Direction Letter</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Combined Preview - Invoice + Buy Direction + Sell Direction */}
              {previewTab === 'combined' && (
                <div ref={previewCombinedRef}>
                  {/* Invoice */}
                  <div className={styles.invoice}>
                    <div className={styles.invoiceHeader}>
                      <div className={styles.logoContainer}>
                        <img src="/citadel-gold-logo.png" alt="Citadel Gold" className={styles.logo} />
                      </div>
                      <h1 className={styles.invoiceTitle}>CITADEL GOLD INVOICE</h1>
                    </div>
                    <div className={styles.goldBar}></div>
                    <div className={styles.invoiceBody}>
                      <div className={styles.dateSection}>
                        <span className={styles.dateLabel}>{invoiceData.date}</span>
                      </div>
                      <div className={styles.infoSection}>
                        <div className={styles.clientInfo}>
                          <p><strong>Client Name</strong> {invoiceData.clientName}</p>
                          <p><strong>Acct. Number</strong> {invoiceData.acctNumber}</p>
                          <p><strong>Acct. Rep.</strong> {invoiceData.acctRep}</p>
                          {invoiceData.acctRep2 && <p><strong>Acct. Rep.</strong> {invoiceData.acctRep2}</p>}
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
                      <div className={styles.tableContainer}>
                        <div className={styles.tableHeader}>
                          <span className={styles.thProduct}>PRODUCT NAME</span>
                          <span className={styles.thQty}>QTY</span>
                          <span className={styles.thPrice}>LIST PRICE</span>
                          <span className={styles.thTotal}>TOTAL</span>
                        </div>
                        {displayItems.map((item, index) => (
                          <div key={`combined-inv-${item.id}`} className={`${styles.tableRow} ${index % 2 === 0 ? styles.tableRowWhite : styles.tableRowGold}`}>
                            <span className={styles.tdProduct}>{item.productName}</span>
                            <span className={styles.tdQty}>{item.qty}</span>
                            <span className={styles.tdPrice}>{item.listPrice ? formatCurrency(parseFloat(item.listPrice.replace(/[^0-9.-]/g, "")) || 0) : ""}</span>
                            <span className={styles.tdTotal}>{item.qty && item.listPrice ? formatCurrency(calculateLineTotal(item.qty, item.listPrice)) : ""}</span>
                          </div>
                        ))}
                      </div>
                      <div className={styles.grandTotalRow}>
                        <div className={styles.grandTotalBox}>
                          <span>GRAND TOTAL : </span>
                          <span>{formatCurrency(calculateGrandTotal())}</span>
                        </div>
                      </div>
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
                      <div className={styles.shippingInfo}>
                        <p>Shipping Information: Orders may take up to 28 days to arrive, as outlined by our wholesalers' timeline, to account for potential product shortages and unforeseen shipping delays. Most shipments are fully insured, require a signature upon delivery, and typically arrive within 7 business days via UPS, FedEx, or USPS. Tracking details will be provided once your order is packaged and ready for shipment.</p>
                      </div>
                      <div className={styles.tagline}>
                        <p>Fortifying Your Future One Precious Metal at a Time</p>
                      </div>
                    </div>
                    <div className={styles.invoiceFooter}>
                      <div className={styles.footerLogo}>
                        <img src="/citadel-gold-logo.png" alt="Citadel Gold" className={styles.footerLogoImg} />
                      </div>
                      <div className={styles.footerContact}>
                        <p><strong>Phone:</strong> 310-209.8166 | <strong>Email:</strong> info@citadelgold.com</p>
                        <p><strong>Website:</strong> www.citadelgold.com</p>
                      </div>
                    </div>
                  </div>

                  <div className="page-break" style={{height: '40px'}}></div>

                  {/* Buy Direction Letter */}
                  <div className={styles.bdl}>
                    <div className={styles.bdlHeader}>
                      <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
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
                            <td className={styles.bdlCell} colSpan={2}>
                              <div className={styles.bdlCellLabel}>DEALER ADDRESS</div>
                              <div className={styles.bdlCellValue}>10433 Wilshire Blvd #1002 Los Angeles, California 90024</div>
                            </td>
                          </tr>
                          <tr>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>PHONE NUMBER</div>
                              <div className={styles.bdlCellValue}>310-209-8166</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>FAX</div>
                              <div className={styles.bdlCellValue}>310-209-8255</div>
                            </td>
                            <td className={styles.bdlCell}>
                              <div className={styles.bdlCellLabel}>REPRESENTATIVE</div>
                              <div className={styles.bdlCellValue}>Shaun Bina</div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.bdlAuthSection}>
                      <div className={styles.bdlAuthText}>
                        <strong>By initialing, I authorize the administrator to accept completion of transaction details for the sections below from the dealer listed in Section 2, without my verification. I understand that Entrust will advise the dealer of this authorization and the funds in the IRA, and will await confirmation from the dealer.</strong>
                      </div>
                      <div className={styles.bdlInitialBox}>
                        <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                        <div className={styles.bdlInitialSpace}></div>
                      </div>
                    </div>
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
                            <span>OVERNIGHT CHECK <span className={styles.bdlCheckNote}>($30 fee applies; cannot overnight to a PO Box. Also,<br/><span style={{display: 'block', textAlign: 'center'}}>invoice must be attached)</span></span></span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{paymentOptions.chargeEntrustAccount ? "X" : ""}</span>
                            <span>Charge my Entrust Account</span>
                          </div>
                          <div className={styles.bdlCheckItem}>
                            <span className={styles.bdlCheckBox}>{paymentOptions.thirdPartyBilling ? "X" : ""}</span>
                            <span>Use third-party billing</span>
                          </div>
                          <div className={styles.bdlCheckItem} style={{marginLeft: '20px', display: 'flex', alignItems: 'baseline'}}>
                            <span className={styles.bdlCheckBox}>{paymentOptions.fedex ? "X" : ""}</span>
                            <span>FedEx</span>
                            <span className={styles.bdlCheckBox} style={{marginLeft: '12px'}}>{paymentOptions.ups ? "X" : ""}</span>
                            <span>UPS</span>
                            <span style={{marginLeft: '8px', whiteSpace: 'nowrap'}}>Account #:</span>
                            <span className={styles.bdlUpsLine}>{paymentOptions.upsAccountNumber}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.bdlSection}>
                      <div className={styles.bdlSectionHeader}>
                        <div className={styles.bdlSectionNum}>4</div>
                        <div className={styles.bdlSectionTitle}>Purchase Instructions</div>
                      </div>
                      <div className={styles.bdlPurchaseIntro}>
                        <strong>I hereby direct the administrator and/or custodian to BUY the following asset(s) for my account:</strong>
                      </div>
                      <table className={styles.bdlPurchaseTable}>
                        <colgroup>
                          <col style={{width: '60px'}} />
                          <col style={{width: '70px'}} />
                          <col style={{width: '180px'}} />
                          <col style={{width: '60px'}} />
                          <col style={{width: '70px'}} />
                          <col style={{width: '90px'}} />
                          <col style={{width: '100px'}} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Quantity<br/><span className={styles.bdlThSub}>(number of units)</span></th>
                            <th>Metal Type</th>
                            <th>Asset Name or Description<br/><span className={styles.bdlThSub}>(U.S. Silver Eagle, 1oz.)</span></th>
                            <th>Proof Am.<br/>Eagle?</th>
                            <th>Troy OZ. Each</th>
                            <th>Price<br/><span className={styles.bdlThSub}>(per number of units)</span></th>
                            <th>Total Purchase Price<br/><span className={styles.bdlThSub}>(quantity times price)</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayItems.map((item) => (
                            <tr key={`combined-buy-${item.id}`}>
                              <td>{item.qty}</td>
                              <td>{item.productName?.split(' ')[0] || ''}</td>
                              <td>{item.productName}</td>
                              <td>{item.proofAmEagle ? 'Yes' : ''}</td>
                              <td>{item.troyOzEach || ''}</td>
                              <td>$ {item.listPrice ? parseFloat(String(item.listPrice).replace(/[^0-9.]/g, "")).toFixed(2) : ''}</td>
                              <td>$ {item.qty && item.listPrice ? calculateLineTotal(item.qty, item.listPrice).toFixed(2) : ''}</td>
                            </tr>
                          ))}
                          {Array.from({ length: Math.max(0, 5 - displayItems.length) }).map((_, idx) => (
                            <tr key={`combined-buy-empty-${idx}`}>
                              <td></td><td></td><td></td><td></td><td></td><td>$</td><td>$</td>
                            </tr>
                          ))}
                          <tr className={styles.bdlSpecialRow}>
                            <td colSpan={5} style={{textAlign: 'left'}}><strong>Special Instructions:</strong></td>
                            <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                            <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                          </tr>
                          {calculateGrandTotal() > 0 && (
                            <tr>
                              <td colSpan={5}></td>
                              <td style={{textAlign: 'right'}}>$ {calculateGrandTotal().toFixed(2)}</td>
                              <td style={{textAlign: 'right'}}>$ {calculateGrandTotal().toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.bdlFooter}>
                      <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
                    </div>
                  </div>

                  {/* Buy Direction Page 2 */}
                  <div className={styles.bdlPage2}>
                      <div className={styles.bdlHeader}>
                        <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
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
                      <div className={styles.bdlSection}>
                        <div className={styles.bdlSectionHeader}>
                          <div className={styles.bdlSectionNum}>5</div>
                          <div className={styles.bdlSectionTitle}>Depository Information</div>
                        </div>
                        <table className={styles.bdlFormTable} style={{tableLayout: 'fixed', borderBottom: 'none'}}>
                          <colgroup>
                            <col style={{width: '33.33%'}} />
                            <col style={{width: '33.33%'}} />
                            <col style={{width: '33.33%'}} />
                          </colgroup>
                          <tbody>
                            <tr>
                              <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                                <div className={styles.bdlCellLabel}>DEPOSITORY NAME</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.depositoryName}</div>
                              </td>
                              <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                                <div className={styles.bdlCellLabel}>CONTACT NAME</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.contactName}</div>
                              </td>
                              <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                                <div className={styles.bdlCellLabel}>CONTACT PHONE NUMBER</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.contactPhone}</div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <table className={styles.bdlFormTable} style={{tableLayout: 'fixed', borderTop: 'none'}}>
                          <colgroup>
                            <col style={{width: '50%'}} />
                            <col style={{width: '25%'}} />
                            <col style={{width: '10%'}} />
                            <col style={{width: '15%'}} />
                          </colgroup>
                          <tbody>
                            <tr>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>DEPOSITORY STREET ADDRESS</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.streetAddress}</div>
                              </td>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>CITY</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.city}</div>
                              </td>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>STATE</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.state}</div>
                              </td>
                              <td className={styles.bdlCell}>
                                <div className={styles.bdlCellLabel}>ZIP CODE</div>
                                <div className={styles.bdlCellValue}>{depositoryInfo.zipCode}</div>
                              </td>
                            </tr>
                            <tr>
                              <td className={styles.bdlCell} colSpan={4} style={{padding: '3px 8px', height: 'auto'}}>
                                <div className={styles.bdlCheckItem} style={{margin: 0, display: 'flex', alignItems: 'center', gap: '6px'}}>
                                  <span className={styles.bdlCheckBox} style={{width: '10px', height: '10px', minWidth: '10px'}}>{depositoryInfo.storageAgreementAttached ? "X" : ""}</span>
                                  <span className={styles.bdlCellLabel}>DEPOSITORY STORAGE AGREEMENT ATTACHED</span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div className={styles.bdlAuthSection} style={{marginTop: '-1px'}}>
                          <div className={styles.bdlAuthText}>
                            <strong>By initialing, I acknowledge the following: There are numerous depositories that specialize in storage and safekeeping of precious metals. I understand that the Administrator and/or Custodian is not and cannot be held responsible for the actions of these depositories. I hereby release and hold harmless the Administrator/Custodian from any damages that I may incur with respect to my choice of depository and any activities or lack of activities on the part of said depository.</strong>
                          </div>
                          <div className={styles.bdlInitialBox} style={{height: '50.63px'}}>
                            <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                            <div className={styles.bdlInitialSpace}></div>
                          </div>
                        </div>
                      </div>
                      <div className={styles.bdlSection}>
                        <div className={styles.bdlSectionHeader} style={{marginBottom: '16.33px'}}>
                          <div className={styles.bdlSectionNum}>6</div>
                          <div className={styles.bdlSectionTitle}>Account Owner Signature and Investment Acknowledgment</div>
                        </div>
                        <div className={styles.bdlLegalText}>
                          <p className={styles.bdlLegalBold}><em>Prior to funding, all transaction documents must be notated "read and approved" with your signature and date</em> <span style={{fontSize: '9.98px'}}>(for example, precious metals invoice).</span></p>
                          <p>I understand that my account is self-directed and that the Administrator and Custodian named in the disclosure statement received when the account was established will not review the merits, legitimacy, appropriateness and/or suitability of any investment in general, including, but not limited to, any investigation and/or due diligence prior to making any investment, or in connection with my account in particular. I acknowledge that I have not requested that the Administrator and/or Custodian provide, and the Administrator and/or Custodian have not provided, any advice with respect to the investment directive set forth in this Buy Direction Letter. I understand that it is my responsibility to conduct all due diligence, but not limited to, search concerning the validity of title, and all other investigation that a reasonably prudent investor would undertake prior to making any investment. I understand that neither the Administrator nor the Custodian determine whether this investment is acceptable under the Employee Retirement Income Securities Act (ERISA), the Internal Revenue Code (IRC), or any applicable federal, state, or local laws, including securities laws. I understand that it is my responsibility to review any investments to ensure compliance with these requirements, including but not limited to investments that engage in Marijuana-related business activities.</p>
                          <p>I understand that neither the Administrator nor the Custodian is a "fiduciary" for my account and/or my investment as such terms are defined in the IRC, ERISA, and/or any applicable federal, state or local laws. I agree to release, indemnify, defend and hold the Administrator and/or Custodian harmless from any claims, including, but not limited to, actions, liabilities, losses, penalties, fines and/or claims by others, arising out of this Buy Direction Letter and/or this investment, including, but not limited to, claims that an investment is not prudent, proper, diversified or otherwise in compliance with ERISA, the IRC and/or any other applicable federal, state or local laws. In the event of claims by others related to my account and/or investment wherein Administrator and/or Custodian are named as a party, Administrator and/or Custodian shall have the full and unequivocal right at their sole discretion to select their own attorneys to represent them in such litigation and deduct from my account any amounts to pay for any costs and expenses, including, but not limited to, all attorneys' fees, and costs and internal costs (collectively "Litigation Costs"), incurred by Administrator and/or Custodian in the defense of such claims and/or litigation. If there are insufficient funds in my account to cover the Litigation Costs incurred by Administrator and/or Custodian, on demand by Administrator and/ or Custodian, I will promptly reimburse Administrator and/or Custodian the outstanding balance of the Litigation Costs. If I fail to promptly reimburse the Litigation Costs, Administrator and/or Custodian shall have the full and unequivocal right to freeze my assets, liquidate my assets, and/or initiate legal action in order to obtain full reimbursement of the Litigation Costs. I also understand and agree that the Administrator and/or Custodian will not be responsible to take any action should there be any default with regard to this investment.</p>
                          <p>I am directing you to complete this transaction as specified above. I confirm that the decision to buy this asset is in accordance with the rules of my account, and I agree to hold harmless and without liability the Administrator and/or Custodian of my account under the foregoing hold harmless provision. I understand that no one at the Administrator and/or Custodian has authority to agree to anything different than my foregoing understandings of Administrator's and/or Custodian's policy. If any provision of this Buy Direction Letter is found to be illegal, invalid, void or unenforceable, such provision shall be severed and such illegality or invalidity shall not affect the remaining provisions, which shall remain in full force and effect. For purposes of this Buy-Direction Letter, the terms Administrator and Custodian include The Entrust Group, its agents, assigns, joint ventures, affiliates and/or business associates, former and present. I declare that I have examined this document, including accompanying information, and to the best of my knowledge and belief, it is true, correct and complete.</p>
                          <p><strong>Not responsible for Market Condition Variances:</strong> I understand that I have agreed and instructed the Custodian to follow the investment direction which I provide to Administrator in investing the principal, as confirmed by written direction letters or instructions to Administrator from the undersigned for the above-referenced Account or other Custodial account for which Administrator serves as record keeper. I further understand that for any transaction that I may direct or instruct Administrator to complete, especially precious metals, that may be dependent upon the operation of global markets and entities, there could be fluctuations in price and condition of said investments from the time that I issue a direction letter to Administrator and the time when the transaction can actually be completed and recorded in my Account. I hereby agree to release, indemnify, defend and hold Administrator and Custodian harmless from any claims regarding the fluctuation in prices and/or conditions of any transaction I direct or instruct Administrator to make on my behalf. I further agree to waive any claims that I have, past, present or future, known or unknown, anticipated or unanticipated, with respect to the fluctuation or change in the price or condition of any investment that I direct or instruct Administrator to make from the time I deliver my direction or instruction letter to Administrator until the time the transaction is actually completed and recorded to my Account. I understand that this hold harmless and release shall apply equally to the Administrator and Custodian.</p>
                          <p style={{marginTop: '16px'}}><strong>I understand that my account is subject to the provisions of Internal Revenue Code (IRC) §4975, which defines certain prohibited transactions.</strong> I acknowledge that neither the Administrator nor the Custodian has made or will make any determination as to whether this investment is prohibited under IRC §4975 or under any other federal, state or local law. I certify that making this investment will not constitute a prohibited transaction and that it complies with all applicable federal, state, and local laws, regulations and requirements.</p>
                          <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>Transactions with insufficient funds will not be processed until sufficient funds are received. If fees are being deducted from your account, the full amount of the transaction plus fees must be available before your transaction can be processed.</em></p>
                          <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>I have read and understand the disclosure above.</em></p>
                        </div>
                        <table className={styles.bdlFormTable} style={{marginTop: '18px'}}>
                          <tbody>
                            <tr>
                              <td className={styles.bdlCell} style={{width: '60%', height: '33px'}}>
                                <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>SIGNATURE</div>
                                <div className={styles.bdlCellValue}></div>
                              </td>
                              <td className={styles.bdlCell} style={{width: '40%', height: '33px'}}>
                                <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>DATE</div>
                                <div className={styles.bdlCellValue}></div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    <div className={styles.bdlFooter}>
                      <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
                    </div>
                  </div>

                  {isBuyAndSell && (
                    <>
                      <div className="page-break" style={{height: '40px'}}></div>

                      {/* Sell Direction Letter - Page 1 */}
                      <div className={styles.bdl}>
                        <div className={styles.bdlHeader}>
                          <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
                          <div className={styles.bdlHeaderCenter}>
                            <div className={styles.bdlHeaderTitle}>Precious Metals</div>
                            <div className={styles.bdlHeaderSubtitle}>Sell Direction Letter</div>
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
                                <td className={styles.bdlCell} colSpan={2}>
                                  <div className={styles.bdlCellLabel}>DEALER ADDRESS</div>
                                  <div className={styles.bdlCellValue}>10433 Wilshire Blvd #1002 Los Angeles, California 90024</div>
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>PHONE NUMBER</div>
                                  <div className={styles.bdlCellValue}>310-209-8166</div>
                                </td>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>FAX</div>
                                  <div className={styles.bdlCellValue}>310-209-8255</div>
                                </td>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>REPRESENTATIVE</div>
                                  <div className={styles.bdlCellValue}>Shaun Bina</div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className={styles.bdlAuthSection}>
                          <div className={styles.bdlAuthText}>
                            <strong>By initialing, I authorize the administrator to accept completion of transaction details for the sections below from the dealer listed in Section 2, without my verification. I understand that Entrust will advise the dealer of this authorization and the funds in the IRA, and will await confirmation from the dealer.</strong>
                          </div>
                          <div className={styles.bdlInitialBox}>
                            <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                            <div className={styles.bdlInitialSpace}></div>
                          </div>
                        </div>
                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader}>
                            <div className={styles.bdlSectionNum}>3</div>
                            <div className={styles.bdlSectionTitle}>Sell Instructions</div>
                          </div>
                          <div className={styles.bdlPurchaseIntro}>
                            <strong>I hereby direct the administrator and/or custodian to SELL the following asset(s) from my account:</strong>
                          </div>
                          <table className={styles.bdlPurchaseTable}>
                            <colgroup>
                              <col style={{width: '60px'}} />
                              <col style={{width: '70px'}} />
                              <col style={{width: '180px'}} />
                              <col style={{width: '60px'}} />
                              <col style={{width: '70px'}} />
                              <col style={{width: '90px'}} />
                              <col style={{width: '100px'}} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>Quantity<br/><span className={styles.bdlThSub}>(number of units)</span></th>
                                <th>Metal Type</th>
                                <th>Asset Name or Description<br/><span className={styles.bdlThSub}>(U.S. Silver Eagle, 1oz.)</span></th>
                                <th>Proof Am.<br/>Eagle?</th>
                                <th>Troy OZ. Each</th>
                                <th>Price<br/><span className={styles.bdlThSub}>(per number of units)</span></th>
                                <th>Total Sell Price<br/><span className={styles.bdlThSub}>(quantity times price)</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {sellData.lineItems.map((item) => (
                                <tr key={`combined-sell-${item.id}`}>
                                  <td>{item.quantity}</td>
                                  <td>{item.metalType}</td>
                                  <td>{item.description}</td>
                                  <td>{item.proofAm}</td>
                                  <td>{item.troyOz}</td>
                                  <td>$ {item.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, "")).toFixed(2) : ''}</td>
                                  <td>$ {item.quantity && item.price ? (parseFloat(item.quantity) * parseFloat(String(item.price).replace(/[^0-9.]/g, ""))).toFixed(2) : ''}</td>
                                </tr>
                              ))}
                              {Array.from({ length: Math.max(0, 5 - sellData.lineItems.length) }).map((_, idx) => (
                                <tr key={`combined-sell-empty-${idx}`}>
                                  <td></td><td></td><td></td><td></td><td></td><td>$</td><td>$</td>
                                </tr>
                              ))}
                              <tr className={styles.bdlSpecialRow}>
                                <td colSpan={5} style={{textAlign: 'left'}}><strong>Special Instructions:</strong> {sellData.specialInstructions}</td>
                                <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                                <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                              </tr>
                              {calculateSellGrandTotal() > 0 && (
                                <tr>
                                  <td colSpan={5}></td>
                                  <td style={{textAlign: 'right'}}>$ {calculateSellGrandTotal().toFixed(2)}</td>
                                  <td style={{textAlign: 'right'}}>$ {calculateSellGrandTotal().toFixed(2)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader}>
                            <div className={styles.bdlSectionNum}>4</div>
                            <div className={styles.bdlSectionTitle}>Delivery Instructions</div>
                          </div>
                          <table className={styles.bdlFormTable}>
                            <tbody>
                              <tr>
                                <td className={styles.bdlCell} style={{width: '50%'}}>
                                  <div className={styles.bdlCellLabel}>DEALER / DEPOSITORY / RECIPIENT NAME</div>
                                  <div className={styles.bdlCellValue}>{sellData.deliveryRecipient}</div>
                                </td>
                                <td className={styles.bdlCell} style={{width: '50%'}}>
                                  <div className={styles.bdlCellLabel}>SUB-ACCOUNT NUMBER</div>
                                  <div className={styles.bdlCellValue}>{sellData.subAccountNumber}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.bdlCell} colSpan={2}>
                                  <div className={styles.bdlCellLabel}>STREET ADDRESS</div>
                                  <div className={styles.bdlCellValue}>{sellData.shippingStreet}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>CITY</div>
                                  <div className={styles.bdlCellValue}>{sellData.shippingCity}</div>
                                </td>
                                <td className={styles.bdlCell} style={{display: 'flex', gap: '0'}}>
                                  <div style={{flex: 1, borderRight: '1px solid #808181', padding: '3px 8px'}}>
                                    <div className={styles.bdlCellLabel}>STATE</div>
                                    <div className={styles.bdlCellValue}>{sellData.shippingState}</div>
                                  </div>
                                  <div style={{flex: 1, padding: '3px 8px'}}>
                                    <div className={styles.bdlCellLabel}>ZIP CODE</div>
                                    <div className={styles.bdlCellValue}>{sellData.shippingZip}</div>
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className={styles.bdlFooter}>
                          <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Sell Direction Letter</div>
                        </div>
                      </div>

                      {/* Sell Direction Letter - Page 2 */}
                      <div className={styles.bdlPage2}>
                        <div className={styles.bdlHeader}>
                          <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
                          <div className={styles.bdlHeaderCenter}>
                            <div className={styles.bdlHeaderTitle}>Precious Metals</div>
                            <div className={styles.bdlHeaderSubtitle}>Sell Direction Letter</div>
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

                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader}>
                            <div className={styles.bdlSectionNum}>5</div>
                            <div className={styles.bdlSectionTitle}>Current Depository Storage Location <span className={styles.bdlSelectOne}>(select one)</span></div>
                          </div>
                          <div className={styles.bdlPaymentGrid} style={{flexWrap: 'wrap', minHeight: 'auto'}}>
                            <div style={{width: '50%', padding: '10px 12px'}}>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.delawareWilmington ? "X" : ""}</span>
                                <span>Delaware Depository - Wilmington</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.delawareBoulder ? "X" : ""}</span>
                                <span>Delaware Depository - Boulder</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.dakota ? "X" : ""}</span>
                                <span>Dakota Depository</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.milesFranklin ? "X" : ""}</span>
                                <span>Miles Franklin</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.amglLasVegas ? "X" : ""}</span>
                                <span>AMGL - Las Vegas</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.amglIrving ? "X" : ""}</span>
                                <span>AMGL - Irving</span>
                              </div>
                            </div>
                            <div style={{width: '50%', padding: '10px 12px'}}>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.idahoArmored ? "X" : ""}</span>
                                <span>Idaho Armored</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.cnt ? "X" : ""}</span>
                                <span>CNT</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.brinksLA ? "X" : ""}</span>
                                <span>Brinks - Los Angeles</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.brinksSaltLake ? "X" : ""}</span>
                                <span>Brinks - Salt Lake City</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depository.brinksJFK ? "X" : ""}</span>
                                <span>Brinks - JFK International</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader}>
                            <div className={styles.bdlSectionNum}>6</div>
                            <div className={styles.bdlSectionTitle}>Deposit Method <span className={styles.bdlSelectOne}>(select one)</span></div>
                          </div>
                          <div className={styles.bdlPaymentGrid}>
                            <div className={styles.bdlPaymentLeft}>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depositMethod.wire ? "X" : ""}</span>
                                <span>WIRE <span className={styles.bdlCheckNote}>($30 fee)</span></span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depositMethod.ach ? "X" : ""}</span>
                                <span>ACH</span>
                              </div>
                            </div>
                            <div className={styles.bdlPaymentRight}>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depositMethod.check ? "X" : ""}</span>
                                <span>CHECK</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.depositMethod.overnightCheck ? "X" : ""}</span>
                                <span>OVERNIGHT CHECK <span className={styles.bdlCheckNote}>($30 fee)</span></span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader}>
                            <div className={styles.bdlSectionNum}>7</div>
                            <div className={styles.bdlSectionTitle}>Fee Payment Method <span className={styles.bdlSelectOne}>(select one)</span></div>
                          </div>
                          <div className={styles.bdlPaymentGrid}>
                            <div className={styles.bdlPaymentLeft}>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.feePayment.payWithCash ? "X" : ""}</span>
                                <span>Pay with cash from asset sale</span>
                              </div>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.feePayment.creditCard ? "X" : ""}</span>
                                <span>Credit Card <span className={styles.bdlCheckNote}>(complete Section 8)</span></span>
                              </div>
                            </div>
                            <div className={styles.bdlPaymentRight}>
                              <div className={styles.bdlCheckItem}>
                                <span className={styles.bdlCheckBox}>{sellData.feePayment.thirdPartyBilling ? "X" : ""}</span>
                                <span>Use third-party billing</span>
                              </div>
                              <div className={styles.bdlCheckItem} style={{marginLeft: '20px', display: 'flex', alignItems: 'baseline'}}>
                                <span className={styles.bdlCheckBox}>{sellData.feePayment.fedex ? "X" : ""}</span>
                                <span>FedEx</span>
                                <span className={styles.bdlCheckBox} style={{marginLeft: '12px'}}>{sellData.feePayment.ups ? "X" : ""}</span>
                                <span>UPS</span>
                                <span style={{marginLeft: '8px', whiteSpace: 'nowrap'}}>Account #:</span>
                                <span className={styles.bdlUpsLine}>{sellData.feePayment.accountNumber}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader}>
                            <div className={styles.bdlSectionNum}>8</div>
                            <div className={styles.bdlSectionTitle}>Credit Card Information</div>
                          </div>
                          <table className={styles.bdlFormTable}>
                            <tbody>
                              <tr>
                                <td className={styles.bdlCell} style={{width: '50%'}}>
                                  <div className={styles.bdlCellLabel}>NAME ON CARD</div>
                                  <div className={styles.bdlCellValue}>{sellData.creditCard.nameOnCard}</div>
                                </td>
                                <td className={styles.bdlCell} style={{width: '50%'}}>
                                  <div className={styles.bdlCellLabel}>CARD TYPE</div>
                                  <div className={styles.bdlCellValue} style={{display: 'flex', gap: '15px', paddingTop: '4px'}}>
                                    <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                      <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'visa' ? "X" : ""}</span>
                                      <span>Visa</span>
                                    </span>
                                    <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                      <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'mastercard' ? "X" : ""}</span>
                                      <span>MC</span>
                                    </span>
                                    <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                      <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'amex' ? "X" : ""}</span>
                                      <span>Amex</span>
                                    </span>
                                    <span className={styles.bdlCheckItem} style={{margin: 0}}>
                                      <span className={styles.bdlCheckBox}>{sellData.creditCard.cardType === 'discover' ? "X" : ""}</span>
                                      <span>Disc</span>
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>CREDIT CARD NUMBER</div>
                                  <div className={styles.bdlCellValue}>{sellData.creditCard.cardNumber}</div>
                                </td>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>EXPIRATION DATE</div>
                                  <div className={styles.bdlCellValue}>{sellData.creditCard.expirationDate}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.bdlCell} colSpan={2}>
                                  <div className={styles.bdlCellLabel}>BILLING ADDRESS</div>
                                  <div className={styles.bdlCellValue}>{sellData.creditCard.billingStreet}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className={styles.bdlCell}>
                                  <div className={styles.bdlCellLabel}>CITY</div>
                                  <div className={styles.bdlCellValue}>{sellData.creditCard.billingCity}</div>
                                </td>
                                <td className={styles.bdlCell} style={{display: 'flex', gap: '0'}}>
                                  <div style={{flex: 1, borderRight: '1px solid #808181', padding: '3px 8px'}}>
                                    <div className={styles.bdlCellLabel}>STATE</div>
                                    <div className={styles.bdlCellValue}>{sellData.creditCard.billingState}</div>
                                  </div>
                                  <div style={{flex: 1, padding: '3px 8px'}}>
                                    <div className={styles.bdlCellLabel}>ZIP CODE</div>
                                    <div className={styles.bdlCellValue}>{sellData.creditCard.billingZip}</div>
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className={styles.bdlFooter}>
                          <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Sell Direction Letter</div>
                        </div>
                      </div>

                      {/* Sell Direction Letter - Page 3 */}
                      <div className={styles.bdlPage2}>
                        <div className={styles.bdlHeader}>
                          <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
                          <div className={styles.bdlHeaderCenter}>
                            <div className={styles.bdlHeaderTitle}>Precious Metals</div>
                            <div className={styles.bdlHeaderSubtitle}>Sell Direction Letter</div>
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

                        <div className={styles.bdlSection}>
                          <div className={styles.bdlSectionHeader} style={{marginBottom: '16.33px'}}>
                            <div className={styles.bdlSectionNum}>9</div>
                            <div className={styles.bdlSectionTitle}>Account Owner Signature and Investment Acknowledgment</div>
                          </div>
                          <div className={styles.bdlLegalText}>
                            <p className={styles.bdlLegalBold}><em>Prior to funding, all transaction documents must be notated "read and approved" with your signature and date</em> <span style={{fontSize: '9.98px'}}>(for example, precious metals invoice).</span></p>

                            <p>I understand that my account is self-directed and that the Administrator and Custodian named in the disclosure statement received when the account was established will not review the merits, legitimacy, appropriateness and/or suitability of any investment in general, including, but not limited to, any investigation and/or due diligence prior to making any investment, or in connection with my account in particular. I acknowledge that I have not requested that the Administrator and/or Custodian provide, and the Administrator and/or Custodian have not provided, any advice with respect to the investment directive set forth in this Sell Direction Letter. I understand that it is my responsibility to conduct all due diligence, but not limited to, search concerning the validity of title, and all other investigation that a reasonably prudent investor would undertake prior to making any investment. I understand that neither the Administrator nor the Custodian determine whether this investment is acceptable under the Employee Retirement Income Securities Act (ERISA), the Internal Revenue Code (IRC), or any applicable federal, state, or local laws, including securities laws. I understand that it is my responsibility to review any investments to ensure compliance with these requirements, including but not limited to investments that engage in Marijuana-related business activities.</p>

                            <p>I understand that neither the Administrator nor the Custodian is a "fiduciary" for my account and/or my investment as such terms are defined in the IRC, ERISA, and/or any applicable federal, state or local laws. I agree to release, indemnify, defend and hold the Administrator and/or Custodian harmless from any claims, including, but not limited to, actions, liabilities, losses, penalties, fines and/or claims by others, arising out of this Sell Direction Letter and/or this investment, including, but not limited to, claims that an investment is not prudent, proper, diversified or otherwise in compliance with ERISA, the IRC and/or any other applicable federal, state or local laws. In the event of claims by others related to my account and/or investment wherein Administrator and/or Custodian are named as a party, Administrator and/or Custodian shall have the full and unequivocal right at their sole discretion to select their own attorneys to represent them in such litigation and deduct from my account any amounts to pay for any costs and expenses, including, but not limited to, all attorneys' fees, and costs and internal costs (collectively "Litigation Costs"), incurred by Administrator and/or Custodian in the defense of such claims and/or litigation. If there are insufficient funds in my account to cover the Litigation Costs incurred by Administrator and/or Custodian, on demand by Administrator and/ or Custodian, I will promptly reimburse Administrator and/or Custodian the outstanding balance of the Litigation Costs. If I fail to promptly reimburse the Litigation Costs, Administrator and/or Custodian shall have the full and unequivocal right to freeze my assets, liquidate my assets, and/or initiate legal action in order to obtain full reimbursement of the Litigation Costs. I also understand and agree that the Administrator and/or Custodian will not be responsible to take any action should there be any default with regard to this investment.</p>

                            <p>I am directing you to complete this transaction as specified above. I confirm that the decision to sell this asset is in accordance with the rules of my account, and I agree to hold harmless and without liability the Administrator and/or Custodian of my account under the foregoing hold harmless provision. I understand that no one at the Administrator and/or Custodian has authority to agree to anything different than my foregoing understandings of Administrator's and/or Custodian's policy. If any provision of this Sell Direction Letter is found to be illegal, invalid, void or unenforceable, such provision shall be severed and such illegality or invalidity shall not affect the remaining provisions, which shall remain in full force and effect. For purposes of this Sell Direction Letter, the terms Administrator and Custodian include The Entrust Group, its agents, assigns, joint ventures, affiliates and/or business associates, former and present. I declare that I have examined this document, including accompanying information, and to the best of my knowledge and belief, it is true, correct and complete.</p>

                            <p><strong>Not responsible for Market Condition Variances:</strong> I understand that I have agreed and instructed the Custodian to follow the investment direction which I provide to Administrator in investing the principal, as confirmed by written direction letters or instructions to Administrator from the undersigned for the above-referenced Account or other Custodial account for which Administrator serves as record keeper. I further understand that for any transaction that I may direct or instruct Administrator to complete, especially precious metals, that may be dependent upon the operation of global markets and entities, there could be fluctuations in price and condition of said investments from the time that I issue a direction letter to Administrator and the time when the transaction can actually be completed and recorded in my Account. I hereby agree to release, indemnify, defend and hold Administrator and Custodian harmless from any claims regarding the fluctuation in prices and/or conditions of any transaction I direct or instruct Administrator to make on my behalf. I further agree to waive any claims that I have, past, present or future, known or unknown, anticipated or unanticipated, with respect to the fluctuation or change in the price or condition of any investment that I direct or instruct Administrator to make from the time I deliver my direction or instruction letter to Administrator until the time the transaction is actually completed and recorded to my Account. I understand that this hold harmless and release shall apply equally to the Administrator and Custodian.</p>

                            <p style={{marginTop: '16px'}}><strong>I understand that my account is subject to the provisions of Internal Revenue Code (IRC) §4975, which defines certain prohibited transactions.</strong> I acknowledge that neither the Administrator nor the Custodian has made or will make any determination as to whether this investment is prohibited under IRC §4975 or under any other federal, state or local law. I certify that making this investment will not constitute a prohibited transaction and that it complies with all applicable federal, state, and local laws, regulations and requirements.</p>

                            <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>Transactions with insufficient funds will not be processed until sufficient funds are received. If fees are being deducted from your account, the full amount of the transaction plus fees must be available before your transaction can be processed.</em></p>

                            <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>I have read and understand the disclosure above.</em></p>
                          </div>
                          <table className={styles.bdlFormTable} style={{marginTop: '18px'}}>
                            <tbody>
                              <tr>
                                <td className={styles.bdlCell} style={{width: '60%', height: '33px'}}>
                                  <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>SIGNATURE</div>
                                  <div className={styles.bdlCellValue}></div>
                                </td>
                                <td className={styles.bdlCell} style={{width: '40%', height: '33px'}}>
                                  <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>DATE</div>
                                  <div className={styles.bdlCellValue}></div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className={styles.bdlFooter}>
                          <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Sell Direction Letter</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
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
        <div ref={buyDirectionRef}>
          {/* Purchase Instructions Pages - 5 items per page */}
          {chunkArray(displayItems, 5).map((itemChunk, chunkIndex, allChunks) => (
            <div key={`pdf-bdl-page-${chunkIndex}`} className={chunkIndex === 0 ? styles.bdl : styles.bdlPage2}>
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
                      <span>OVERNIGHT CHECK <span className={styles.bdlCheckNote}>($30 fee applies; cannot overnight to a PO Box. Also,<br/><span style={{display: 'block', textAlign: 'center'}}>invoice must be attached)</span></span></span>
                    </div>
                    <div className={styles.bdlCheckItem}>
                      <span className={styles.bdlCheckBox}>{paymentOptions.chargeEntrustAccount ? "X" : ""}</span>
                      <span>Charge my Entrust Account</span>
                    </div>
                    <div className={styles.bdlCheckItem}>
                      <span className={styles.bdlCheckBox}>{paymentOptions.thirdPartyBilling ? "X" : ""}</span>
                      <span>Use third-party billing</span>
                    </div>
                    <div className={styles.bdlCheckItem} style={{marginLeft: '20px', display: 'flex', alignItems: 'baseline'}}>
                      <span className={styles.bdlCheckBox}>{paymentOptions.fedex ? "X" : ""}</span>
                      <span>FedEx</span>
                      <span className={styles.bdlCheckBox} style={{marginLeft: '12px'}}>{paymentOptions.ups ? "X" : ""}</span>
                      <span>UPS</span>
                      <span style={{marginLeft: '8px', whiteSpace: 'nowrap'}}>Account #:</span>
                      <span className={styles.bdlUpsLine}>{paymentOptions.upsAccountNumber}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Purchase Instructions */}
              <div className={styles.bdlSection}>
                <div className={styles.bdlSectionHeader}>
                  <div className={styles.bdlSectionNum}>4</div>
                  <div className={styles.bdlSectionTitle}>Purchase Instructions {allChunks.length > 1 ? `(Page ${chunkIndex + 1} of ${allChunks.length})` : ''}</div>
                </div>
                <div className={styles.bdlPurchaseIntro}>
                  <strong>I hereby direct the administrator and/or custodian to BUY the following asset(s) for my account:</strong>
                </div>
                <table className={styles.bdlPurchaseTable}>
                  <colgroup>
                    <col style={{width: '60px'}} />
                    <col style={{width: '70px'}} />
                    <col style={{width: '180px'}} />
                    <col style={{width: '60px'}} />
                    <col style={{width: '70px'}} />
                    <col style={{width: '90px'}} />
                    <col style={{width: '100px'}} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Quantity<br/><span className={styles.bdlThSub}>(number of units)</span></th>
                      <th>Metal Type</th>
                      <th>Asset Name or Description<br/><span className={styles.bdlThSub}>(U.S. Silver Eagle, 1oz.)</span></th>
                      <th>Proof Am.<br/>Eagle?</th>
                      <th>Troy OZ. Each</th>
                      <th>Price<br/><span className={styles.bdlThSub}>(per number of units)</span></th>
                      <th>Total Purchase Price<br/><span className={styles.bdlThSub}>(quantity times price)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemChunk.map((item) => (
                      <tr key={`pdf-bdl-${item.id}`}>
                        <td>{item.qty}</td>
                        <td>{item.productName?.split(' ')[0] || ''}</td>
                        <td>{item.productName}</td>
                        <td>{item.proofAmEagle ? 'Yes' : ''}</td>
                        <td>{item.troyOzEach || ''}</td>
                        <td>$ {item.listPrice ? parseFloat(String(item.listPrice).replace(/[^0-9.]/g, "")).toFixed(2) : ''}</td>
                        <td>$ {item.qty && item.listPrice ? calculateLineTotal(item.qty, item.listPrice).toFixed(2) : ''}</td>
                      </tr>
                    ))}
                    {/* Add empty rows to fill 5 rows */}
                    {Array.from({ length: Math.max(0, 5 - itemChunk.length) }).map((_, idx) => (
                      <tr key={`pdf-empty-${chunkIndex}-${idx}`}>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>$</td>
                        <td>$</td>
                      </tr>
                    ))}
                    {/* Only show totals on the last page */}
                    {chunkIndex === allChunks.length - 1 && (
                      <tr className={styles.bdlSpecialRow}>
                        <td colSpan={5} style={{textAlign: 'left'}}><strong>Special Instructions:</strong></td>
                        <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                        <td style={{padding: '4px 8px', verticalAlign: 'middle'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>$</span><strong>Total</strong></div></td>
                      </tr>
                    )}
                    {chunkIndex === allChunks.length - 1 && calculateGrandTotal() > 0 && (
                      <tr>
                        <td colSpan={5}></td>
                        <td style={{textAlign: 'right'}}>$ {calculateGrandTotal().toFixed(2)}</td>
                        <td style={{textAlign: 'right'}}>$ {calculateGrandTotal().toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className={styles.bdlFooter}>
                <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
              </div>
            </div>
          ))}

          {/* Page 2 - Signature sections */}
          <div className={styles.bdlPage2}>
            <div className={styles.bdlHeader}>
              <div className={styles.bdlLogo}><img src="/entrust.png" alt="The Entrust Group" /></div>
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
            <div className={styles.bdlSection}>
              <div className={styles.bdlSectionHeader}>
                <div className={styles.bdlSectionNum}>5</div>
                <div className={styles.bdlSectionTitle}>Depository Information</div>
              </div>
              <table className={styles.bdlFormTable} style={{tableLayout: 'fixed', borderBottom: 'none'}}>
                <colgroup>
                  <col style={{width: '33.33%'}} />
                  <col style={{width: '33.33%'}} />
                  <col style={{width: '33.33%'}} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                      <div className={styles.bdlCellLabel}>DEPOSITORY NAME</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.depositoryName}</div>
                    </td>
                    <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                      <div className={styles.bdlCellLabel}>CONTACT NAME</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.contactName}</div>
                    </td>
                    <td className={styles.bdlCell} style={{borderBottom: 'none'}}>
                      <div className={styles.bdlCellLabel}>CONTACT PHONE NUMBER</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.contactPhone}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table className={styles.bdlFormTable} style={{tableLayout: 'fixed', borderTop: 'none'}}>
                <colgroup>
                  <col style={{width: '50%'}} />
                  <col style={{width: '25%'}} />
                  <col style={{width: '10%'}} />
                  <col style={{width: '15%'}} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className={styles.bdlCell}>
                      <div className={styles.bdlCellLabel}>DEPOSITORY STREET ADDRESS</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.streetAddress}</div>
                    </td>
                    <td className={styles.bdlCell}>
                      <div className={styles.bdlCellLabel}>CITY</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.city}</div>
                    </td>
                    <td className={styles.bdlCell}>
                      <div className={styles.bdlCellLabel}>STATE</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.state}</div>
                    </td>
                    <td className={styles.bdlCell}>
                      <div className={styles.bdlCellLabel}>ZIP CODE</div>
                      <div className={styles.bdlCellValue}>{depositoryInfo.zipCode}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.bdlCell} colSpan={4} style={{padding: '3px 8px', height: 'auto'}}>
                      <div className={styles.bdlCheckItem} style={{margin: 0, display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <span className={styles.bdlCheckBox} style={{width: '10px', height: '10px', minWidth: '10px'}}>{depositoryInfo.storageAgreementAttached ? "X" : ""}</span>
                        <span className={styles.bdlCellLabel}>DEPOSITORY STORAGE AGREEMENT ATTACHED</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className={styles.bdlAuthSection} style={{marginTop: '-1px'}}>
                <div className={styles.bdlAuthText}>
                  <strong>By initialing, I acknowledge the following: There are numerous depositories that specialize in storage and safekeeping of precious metals. I understand that the Administrator and/or Custodian is not and cannot be held responsible for the actions of these depositories. I hereby release and hold harmless the Administrator/Custodian from any damages that I may incur with respect to my choice of depository and any activities or lack of activities on the part of said depository.</strong>
                </div>
                <div className={styles.bdlInitialBox} style={{height: '50.63px'}}>
                  <div className={styles.bdlInitialLabel}>INITIAL HERE</div>
                  <div className={styles.bdlInitialSpace}></div>
                </div>
              </div>
            </div>
            <div className={styles.bdlSection}>
              <div className={styles.bdlSectionHeader} style={{marginBottom: '16.33px'}}>
                <div className={styles.bdlSectionNum}>6</div>
                <div className={styles.bdlSectionTitle}>Account Owner Signature and Investment Acknowledgment</div>
              </div>
              <div className={styles.bdlLegalText}>
                <p className={styles.bdlLegalBold}><em>Prior to funding, all transaction documents must be notated "read and approved" with your signature and date</em> <span style={{fontSize: '9.98px'}}>(for example, precious metals invoice).</span></p>
                <p>I understand that my account is self-directed and that the Administrator and Custodian named in the disclosure statement received when the account was established will not review the merits, legitimacy, appropriateness and/or suitability of any investment in general, including, but not limited to, any investigation and/or due diligence prior to making any investment, or in connection with my account in particular. I acknowledge that I have not requested that the Administrator and/or Custodian provide, and the Administrator and/or Custodian have not provided, any advice with respect to the investment directive set forth in this Buy Direction Letter. I understand that it is my responsibility to conduct all due diligence, but not limited to, search concerning the validity of title, and all other investigation that a reasonably prudent investor would undertake prior to making any investment. I understand that neither the Administrator nor the Custodian determine whether this investment is acceptable under the Employee Retirement Income Securities Act (ERISA), the Internal Revenue Code (IRC), or any applicable federal, state, or local laws, including securities laws. I understand that it is my responsibility to review any investments to ensure compliance with these requirements, including but not limited to investments that engage in Marijuana-related business activities.</p>
                <p>I understand that neither the Administrator nor the Custodian is a "fiduciary" for my account and/or my investment as such terms are defined in the IRC, ERISA, and/or any applicable federal, state or local laws. I agree to release, indemnify, defend and hold the Administrator and/or Custodian harmless from any claims, including, but not limited to, actions, liabilities, losses, penalties, fines and/or claims by others, arising out of this Buy Direction Letter and/or this investment, including, but not limited to, claims that an investment is not prudent, proper, diversified or otherwise in compliance with ERISA, the IRC and/or any other applicable federal, state or local laws. In the event of claims by others related to my account and/or investment wherein Administrator and/or Custodian are named as a party, Administrator and/or Custodian shall have the full and unequivocal right at their sole discretion to select their own attorneys to represent them in such litigation and deduct from my account any amounts to pay for any costs and expenses, including, but not limited to, all attorneys' fees, and costs and internal costs (collectively "Litigation Costs"), incurred by Administrator and/or Custodian in the defense of such claims and/or litigation. If there are insufficient funds in my account to cover the Litigation Costs incurred by Administrator and/or Custodian, on demand by Administrator and/ or Custodian, I will promptly reimburse Administrator and/or Custodian the outstanding balance of the Litigation Costs. If I fail to promptly reimburse the Litigation Costs, Administrator and/or Custodian shall have the full and unequivocal right to freeze my assets, liquidate my assets, and/or initiate legal action in order to obtain full reimbursement of the Litigation Costs. I also understand and agree that the Administrator and/or Custodian will not be responsible to take any action should there be any default with regard to this investment.</p>
                <p>I am directing you to complete this transaction as specified above. I confirm that the decision to buy this asset is in accordance with the rules of my account, and I agree to hold harmless and without liability the Administrator and/or Custodian of my account under the foregoing hold harmless provision. I understand that no one at the Administrator and/or Custodian has authority to agree to anything different than my foregoing understandings of Administrator's and/or Custodian's policy. If any provision of this Buy Direction Letter is found to be illegal, invalid, void or unenforceable, such provision shall be severed and such illegality or invalidity shall not affect the remaining provisions, which shall remain in full force and effect. For purposes of this Buy-Direction Letter, the terms Administrator and Custodian include The Entrust Group, its agents, assigns, joint ventures, affiliates and/or business associates, former and present. I declare that I have examined this document, including accompanying information, and to the best of my knowledge and belief, it is true, correct and complete.</p>
                <p><strong>Not responsible for Market Condition Variances:</strong> I understand that I have agreed and instructed the Custodian to follow the investment direction which I provide to Administrator in investing the principal, as confirmed by written direction letters or instructions to Administrator from the undersigned for the above-referenced Account or other Custodial account for which Administrator serves as record keeper. I further understand that for any transaction that I may direct or instruct Administrator to complete, especially precious metals, that may be dependent upon the operation of global markets and entities, there could be fluctuations in price and condition of said investments from the time that I issue a direction letter to Administrator and the time when the transaction can actually be completed and recorded in my Account. I hereby agree to release, indemnify, defend and hold Administrator and Custodian harmless from any claims regarding the fluctuation in prices and/or conditions of any transaction I direct or instruct Administrator to make on my behalf. I further agree to waive any claims that I have, past, present or future, known or unknown, anticipated or unanticipated, with respect to the fluctuation or change in the price or condition of any investment that I direct or instruct Administrator to make from the time I deliver my direction or instruction letter to Administrator until the time the transaction is actually completed and recorded to my Account. I understand that this hold harmless and release shall apply equally to the Administrator and Custodian.</p>
                <p style={{marginTop: '16px'}}><strong>I understand that my account is subject to the provisions of Internal Revenue Code (IRC) §4975, which defines certain prohibited transactions.</strong> I acknowledge that neither the Administrator nor the Custodian has made or will make any determination as to whether this investment is prohibited under IRC §4975 or under any other federal, state or local law. I certify that making this investment will not constitute a prohibited transaction and that it complies with all applicable federal, state, and local laws, regulations and requirements.</p>
                <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>Transactions with insufficient funds will not be processed until sufficient funds are received. If fees are being deducted from your account, the full amount of the transaction plus fees must be available before your transaction can be processed.</em></p>
                <p className={styles.bdlLegalBold} style={{fontSize: '9.29px'}}><em>I have read and understand the disclosure above.</em></p>
              </div>
              <table className={styles.bdlFormTable} style={{marginTop: '18px'}}>
                <tbody>
                  <tr>
                    <td className={styles.bdlCell} style={{width: '60%', height: '33px'}}>
                      <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>SIGNATURE</div>
                      <div className={styles.bdlCellValue}></div>
                    </td>
                    <td className={styles.bdlCell} style={{width: '40%', height: '33px'}}>
                      <div className={styles.bdlCellLabel} style={{fontWeight: 700}}>DATE</div>
                      <div className={styles.bdlCellValue}></div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.bdlFooter}>
              <div className={styles.bdlFooterCenter}>Copyright The Entrust Group - Precious Metals Buy Direction Letter 10-25-2021</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
