import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { APP_NAME } from "@/lib/constants";
import { formatDateOnly, formatZAR } from "@/lib/format";
import { balanceCents, centsToMoney } from "@/lib/invoices/calc";
import type { InvoiceDetail } from "@/lib/invoices/types";
import type { BusinessSettings } from "@/lib/settings/types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 10,
    color: "#1c1917",
    fontFamily: "Helvetica",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  logo: {
    width: 120,
    height: 48,
    objectFit: "contain",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  muted: {
    color: "#57534e",
    marginBottom: 2,
  },
  section: {
    marginTop: 18,
  },
  heading: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d3d1",
    paddingBottom: 4,
    marginTop: 16,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e7e5e4",
    paddingVertical: 5,
  },
  description: { width: "40%" },
  qty: { width: "12%", textAlign: "right" },
  money: { width: "16%", textAlign: "right" },
  vat: { width: "16%", textAlign: "right" },
  totals: {
    marginTop: 10,
    marginLeft: "auto",
    width: 220,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  grand: {
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
  },
  bank: {
    marginTop: 22,
    padding: 10,
    backgroundColor: "#f5f5f4",
  },
  notes: {
    marginTop: 16,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    color: "#78716c",
    fontSize: 8,
  },
});

export function InvoicePdfDocument({
  invoice,
  settings,
  logoSrc,
}: {
  invoice: InvoiceDetail;
  settings: BusinessSettings;
  logoSrc: string | null;
}) {
  const businessName = settings.businessName.trim() || APP_NAME;
  const taxInvoice = Boolean(settings.vatNumber);
  const paid = invoice.amountPaid !== "0.00";

  return (
    <Document title={invoice.invoiceNumber} author={businessName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.row}>
          <View>
            {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
            <Text style={styles.title}>{businessName}</Text>
            {linesOf(settings.address).map((line) => (
              <Text key={line} style={styles.muted}>
                {line}
              </Text>
            ))}
            {settings.phone ? <Text style={styles.muted}>{settings.phone}</Text> : null}
            {settings.email ? <Text style={styles.muted}>{settings.email}</Text> : null}
            {settings.vatNumber ? (
              <Text style={styles.muted}>VAT {settings.vatNumber}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.title}>{taxInvoice ? "Tax invoice" : "Invoice"}</Text>
            <Text>{invoice.invoiceNumber}</Text>
            <Text style={styles.muted}>Issued {formatDateOnly(invoice.issueDate)}</Text>
            <Text style={styles.muted}>Due {formatDateOnly(invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Bill to</Text>
          <Text>{invoice.tenantName}</Text>
          {invoice.tenantEmail ? <Text style={styles.muted}>{invoice.tenantEmail}</Text> : null}
          {invoice.tenantPhone ? <Text style={styles.muted}>{invoice.tenantPhone}</Text> : null}
          <Text style={styles.muted}>{invoice.propertyName}</Text>
          {invoice.propertyAddress ? (
            <Text style={styles.muted}>{invoice.propertyAddress}</Text>
          ) : null}
          <Text style={styles.muted}>
            Period {formatDateOnly(invoice.periodStart)} to {formatDateOnly(invoice.periodEnd)}
          </Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.description}>Description</Text>
          <Text style={styles.qty}>Qty</Text>
          <Text style={styles.money}>Unit price</Text>
          <Text style={styles.vat}>VAT</Text>
          <Text style={styles.money}>Amount</Text>
        </View>
        {invoice.lines.map((line) => (
          <View key={line.id} style={styles.tableRow}>
            <Text style={styles.description}>{line.description}</Text>
            <Text style={styles.qty}>{line.quantity.replace(".", ",")}</Text>
            <Text style={styles.money}>{zar(line.unitPrice)}</Text>
            <Text style={styles.vat}>{line.vatApplicable ? "15%" : "-"}</Text>
            <Text style={styles.money}>{zar(line.lineTotal)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{zar(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>VAT</Text>
            <Text>{zar(invoice.vatAmount)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grand]}>
            <Text>Total</Text>
            <Text>{zar(invoice.total)}</Text>
          </View>
          {paid ? (
            <View style={styles.totalRow}>
              <Text>Amount paid</Text>
              <Text>{zar(invoice.amountPaid)}</Text>
            </View>
          ) : null}
          {paid ? (
            <View style={[styles.totalRow, styles.grand]}>
              <Text>Balance due</Text>
              <Text>{zar(centsToMoney(balanceCents(invoice.total, invoice.amountPaid)))}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bank}>
          <Text style={styles.heading}>Payment details</Text>
          <Text>Reference {invoice.invoiceNumber}</Text>
          {settings.bankName ? <Text>Bank {settings.bankName}</Text> : null}
          {settings.accountName ? <Text>Account name {settings.accountName}</Text> : null}
          {settings.accountNumber ? (
            <Text>Account number {settings.accountNumber}</Text>
          ) : null}
          {settings.branchCode ? <Text>Branch code {settings.branchCode}</Text> : null}
        </View>

        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.heading}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Use {invoice.invoiceNumber} as the payment reference.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(
  invoice: InvoiceDetail,
  settings: BusinessSettings,
  logoSrc: string | null,
): Promise<Buffer> {
  return renderToBuffer(
    <InvoicePdfDocument invoice={invoice} settings={settings} logoSrc={logoSrc} />,
  );
}

function linesOf(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function zar(amount: string): string {
  return formatZAR(amount).replace(/[\u00a0\u202f]/g, " ");
}
