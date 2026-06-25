// ═══════════════════════════════════════════════════════════
//  PDF GENERATION
//  Uses jsPDF (loaded from CDN in index.html) to render an
//  invoice matching the look of the existing reference invoice:
//  clean, minimal, gold accent, business + recipient blocks,
//  itemised table, total, amount-in-words footer.
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

  // invoice = { invoiceNo, date, recipient:{name,address,phone}, items:[{name,qty,price}], total, business:{name,address,fssai,phone,email} }
  async generate(invoice) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 48;
    let y = 56;

    const GOLD = [200, 134, 10];
    const INK = [26, 18, 8];
    const FAINT = [138, 122, 106];
    const LINE = [232, 224, 212];

    // ── Header: business name (gold, display-ish) ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...GOLD);
    doc.text(invoice.business.name || 'Dr. Shroom Snacks', marginX, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    y += 16;
    if (invoice.business.address) {
      const addrLines = doc.splitTextToSize(invoice.business.address, 260);
      doc.text(addrLines, marginX, y);
      y += addrLines.length * 12;
    }
    if (invoice.business.fssai) {
      doc.text('FSSAI: ' + invoice.business.fssai, marginX, y);
      y += 12;
    }
    if (invoice.business.phone) {
      doc.text('Phone: +91 ' + invoice.business.phone, marginX, y);
      y += 12;
    }

    // ── Recipient block, right aligned ──
    let ry = 56;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text('BILL TO', pageWidth - marginX, ry, { align: 'right' });
    ry += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(invoice.recipient.name || '', pageWidth - marginX, ry, { align: 'right' });
    ry += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    if (invoice.recipient.address) {
      const lines = doc.splitTextToSize(invoice.recipient.address, 200);
      lines.forEach(line => {
        doc.text(line, pageWidth - marginX, ry, { align: 'right' });
        ry += 12;
      });
    }
    if (invoice.recipient.phone) {
      doc.text('+91 ' + invoice.recipient.phone, pageWidth - marginX, ry, { align: 'right' });
      ry += 12;
    }

    y = Math.max(y, ry) + 24;

    // ── Invoice title + number/date row ──
    doc.setDrawColor(...LINE);
    doc.setLineWidth(1);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text('Invoice ' + invoice.invoiceNo, marginX, y);
    y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text('INVOICE DATE', marginX, y);
    doc.text('DUE DATE', marginX + 160, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(invoice.date, marginX, y);
    doc.text(invoice.date, marginX + 160, y); // immediate payment terms => same as invoice date
    y += 28;

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
      doc.text(Number(item.price).toFixed(2), colPrice, y, { align: 'right' });
      doc.text('\u20B9 ' + subtotal.toFixed(2), colAmount, y, { align: 'right' });
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
    doc.setTextColor(...GOLD);
    doc.text('Total', colPrice, y, { align: 'right' });
    doc.setTextColor(...INK);
    doc.text('\u20B9 ' + Number(invoice.total).toFixed(2), colAmount, y, { align: 'right' });
    y += 36;

    // ── Payment terms ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text('Payment terms: Immediate Payment', marginX, y);
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
