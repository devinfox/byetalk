"use client";

import { useState, useRef } from "react";
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
  acctRep: string;
  acctRep2: string;
  salesInvoiceNo: string;
  billTo: string;
  shipTo: string;
  lineItems: LineItem[];
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
  acctRep: "",
  acctRep2: "",
  salesInvoiceNo: "",
  billTo: "",
  shipTo: "",
  lineItems: [initialLineItem()],
};

export default function InvoicePage() {
  const [invoiceData, setInvoiceData] = useState<InvoiceData>(initialInvoiceData);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

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

  // Only show rows that have data
  const displayItems = invoiceData.lineItems;

  return (
    <div className={styles.pageContainer}>
      {/* Form Section */}
      <div className={styles.formSection}>
        <h1 className={styles.pageTitle}>Create Invoice</h1>

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
            {isGenerating ? "Generating..." : "Generate PDF"}
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
    </div>
  );
}
