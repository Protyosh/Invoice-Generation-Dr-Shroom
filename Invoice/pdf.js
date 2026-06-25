// ═══════════════════════════════════════════════════════════
//  PDF GENERATION
//  Uses jsPDF (loaded from CDN in index.html).
//  Black & white friendly — no colour fills, just black ink on
//  white, since invoices get printed on B&W printers. Logo sits
//  top-centre. Currency is written as "Rs." rather than the ₹
//  glyph, since the ₹ symbol isn't reliably embedded in jsPDF's
//  built-in fonts and was rendering as a stray "1" artifact.
// ═══════════════════════════════════════════════════════════

const PdfGen = {

  numberToWords(num) {
    // Minimal Indian-numbering currency-to-words (rupees only, no paise)
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function twoDigits(n) {
      if (n < 20) return ones[n];
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }
    function threeDigits(n) {
      if (n < 100) return twoDigits(n);
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' And ' + twoDigits(n % 100) : '');
    }

    let n = Math.round(num);
    if (n === 0) return 'Zero Rupees';

    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh  = Math.floor(n / 100000);    n %= 100000;
    const thousand = Math.floor(n / 1000);   n %= 1000;
    const hundred = n;

    let parts = [];
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigits(hundred));

    return parts.join(' ') + ' Rupees';
  },

  // Loads ./icon-512.png as a data URL so jsPDF can embed it as an image.
  // Falls back to null if it can't be loaded (e.g. file missing) — the
  // PDF still renders fine without a logo in that case.
  _logoCache: null,
  async loadLogo() {
    if (this._logoCache !== null) return this._logoCache; // cached (incl. null = "tried, failed")
    try {
      const res = await fetch('icon-512.png');
      if (!res.ok) throw new Error('not found');
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      this._logoCache = dataUrl;
    } catch (e) {
      this._logoCache = null;
    }
    return this._logoCache;
  },

  // Adds `days` to a dd/mm/yyyy date string, returns dd/mm/yyyy.
  addDaysToDateStr(dateStr, days) {
    const [d, m, y] = dateStr.split('/').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + Number(days || 0));
    const pad = n => String(n).padStart(2, '0');
    return pad(dt.getDate()) + '/' + pad(dt.getMonth() + 1) + '/' + dt.getFullYear();
  },

  // invoice = {
  //   invoiceNo, date, recipient:{name,address,phone},
  //   items:[{name,qty,price}], total,
  //   business:{name,address,fssai,phone,email},
  //   paymentTermsDays: 0,            // 0 = "Immediate Payment"
  // }
  async generate(invoice) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 48;
    let y = 56;

    // Black & white palette only — no colour fills, safe for any printer.
    const INK = [20, 20, 20];
    const FAINT = [110, 110, 110];
    const LINE = [210, 210, 210];

    // ── Logo, centred at top ──
    const logo = await this.loadLogo();
    if (logo) {
      const logoSize = 44;
      doc.addImage(logo, 'PNG', (pageWidth - logoSize) / 2, y - 10, logoSize, logoSize);
      y += logoSize + 8;
    }

    // ── Business name, centred ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...INK);
    doc.text(invoice.business.name || 'Dr. Shroom Snacks', pageWidth / 2, y, { align: 'center' });
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    if (invoice.business.address) {
      const addrLines = doc.splitTextToSize(invoice.business.address, 320);
      addrLines.forEach(line => { doc.text(line, pageWidth / 2, y, { align: 'center' }); y += 12; });
    }
    let bizLine2 = [];
    if (invoice.business.fssai) bizLine2.push('FSSAI: ' + invoice.business.fssai);
    if (invoice.business.phone) bizLine2.push('Phone: +91 ' + invoice.business.phone);
    if (bizLine2.length) {
      doc.text(bizLine2.join('   ·   '), pageWidth / 2, y, { align: 'center' });
      y += 12;
    }

    y += 16;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(1);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 24;

    // ── Bill To (left) + Invoice meta (right) ──
    let leftY = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text('BILL TO', marginX, leftY);
    leftY += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(invoice.recipient.name || '', marginX, leftY);
    leftY += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    if (invoice.recipient.address) {
      const lines = doc.splitTextToSize(invoice.recipient.address, 240);
      lines.forEach(line => { doc.text(line, marginX, leftY); leftY += 12; });
    }
    if (invoice.recipient.phone) {
      doc.text('+91 ' + invoice.recipient.phone, marginX, leftY);
      leftY += 12;
    }

    let rightY = y;
    const rightX = pageWidth - marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text('INVOICE', rightX, rightY, { align: 'right' });
    rightY += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(invoice.invoiceNo, rightX, rightY, { align: 'right' });
    rightY += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text('INVOICE DATE', rightX - 90, rightY, { align: 'right' });
    doc.text('DUE DATE', rightX, rightY, { align: 'right' });
    rightY += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const paymentDays = Number(invoice.paymentTermsDays) || 0;
    const dueDate = paymentDays > 0 ? this.addDaysToDateStr(invoice.date, paymentDays) : invoice.date;
    doc.text(invoice.date, rightX - 90, rightY, { align: 'right' });
    doc.text(dueDate, rightX, rightY, { align: 'right' });
    rightY += 14;

    y = Math.max(leftY, rightY) + 20;

    // ── Items table ──
    const colDesc = marginX;
    const colQty = pageWidth - marginX - 220;
    const colPrice = pageWidth - marginX - 140;
    const colAmount = pageWidth - marginX;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text('DESCRIPTION', colDesc, y);
    doc.text('QUANTITY', colQty, y, { align: 'right' });
    doc.text('UNIT PRICE', colPrice, y, { align: 'right' });
    doc.text('AMOUNT', colAmount, y, { align: 'right' });
    y += 8;
    doc.setDrawColor(...INK);
    doc.setLineWidth(1);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...INK);

    invoice.items.forEach(item => {
      const subtotal = Number(item.qty) * Number(item.price);
      doc.text(item.name, colDesc, y);
      doc.text(Number(item.qty).toFixed(2), colQty, y, { align: 'right' });
      doc.text('Rs. ' + Number(item.price).toFixed(2), colPrice, y, { align: 'right' });
      doc.text('Rs. ' + subtotal.toFixed(2), colAmount, y, { align: 'right' });
      y += 22;
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.5);
      doc.line(marginX, y - 8, pageWidth - marginX, y - 8);
    });

    y += 6;
    doc.setDrawColor(...INK);
    doc.setLineWidth(1);
    doc.line(colPrice - 60, y, pageWidth - marginX, y);
    y += 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text('Total', colPrice, y, { align: 'right' });
    doc.text('Rs. ' + Number(invoice.total).toFixed(2), colAmount, y, { align: 'right' });
    y += 36;

    // ── Payment terms ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const termsLabel = paymentDays > 0 ? `Payment terms: Net ${paymentDays} days (due ${dueDate})` : 'Payment terms: Immediate Payment';
    doc.text(termsLabel, marginX, y);
    y += 30;

    // ── Amount in words ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text('TOTAL AMOUNT IN WORDS:', pageWidth - marginX, y, { align: 'right' });
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    const wordsText = this.numberToWords(invoice.total);
    const wordsLines = doc.splitTextToSize(wordsText, 220);
    wordsLines.forEach(line => {
      doc.text(line, pageWidth - marginX, y, { align: 'right' });
      y += 12;
    });

    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Payment Communication: ' + invoice.invoiceNo, marginX, y);

    // ── Footer ──
    const footerY = doc.internal.pageSize.getHeight() - 50;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, footerY - 14, pageWidth - marginX, footerY - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text(invoice.business.email || '', pageWidth / 2, footerY, { align: 'center' });
    doc.text('Page 1 / 1', pageWidth / 2, footerY + 14, { align: 'center' });

    return doc;
  },

  async generateAndDownload(invoice) {
    const doc = await this.generate(invoice);
    const filename = invoice.invoiceNo.replace(/\//g, '-') + '.pdf';
    doc.save(filename);
    return filename;
  },

  async generateBlob(invoice) {
    const doc = await this.generate(invoice);
    return doc.output('blob');
  },
};
