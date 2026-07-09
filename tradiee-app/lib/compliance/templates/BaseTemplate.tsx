/**
 * BaseTemplate.tsx
 * Shared styles, helpers, and layout primitives for all compliance PDF templates.
 * Adapted from PS Express for use in tradiee-app (Next.js server-side rendering).
 */

import React from 'react';
import { StyleSheet, Font } from '@react-pdf/renderer';
import { DEFAULT_TIMEZONE, formatDate } from '@/lib/datetime';

// ── FONT REGISTRATION ─────────────────────────────────────────────────────────
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica', fontWeight: 'normal' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
    { src: 'Helvetica-Oblique', fontStyle: 'italic' },
  ],
});

// ── COUNCIL CONFIG ────────────────────────────────────────────────────────────
export const COUNCIL_CONFIG: Record<string, { display: string; footer: string }> = {
  'auckland':            { display: 'Auckland Council',                   footer: 'Auckland Council Building Consents  |  Private Bag 92300, Auckland 1142  |  www.aucklandcouncil.govt.nz  |  Ph 09 301 0101' },
  'wellington':          { display: 'Wellington City Council',            footer: 'Wellington City Council Building & Resource Consents  |  PO Box 2199, Wellington 6140  |  www.wellington.govt.nz  |  Ph 04 499 4444' },
  'christchurch':        { display: 'Christchurch City Council',          footer: 'Christchurch City Council Building Team  |  PO Box 73013, Christchurch 8154  |  www.ccc.govt.nz  |  Ph 03 941 8999' },
  'hamilton':            { display: 'Hamilton City Council',              footer: 'Hamilton City Council Building Control  |  PO Box 151, Hamilton 3240  |  www.hamilton.govt.nz  |  Ph 07 838 6699' },
  'tauranga':            { display: 'Tauranga City Council',              footer: 'Tauranga City Council Building Services  |  PO Box 2141, Tauranga 3140  |  www.tauranga.govt.nz  |  Ph 07 577 7000' },
  'dunedin':             { display: 'Dunedin City Council',               footer: 'Dunedin City Council Building Services  |  PO Box 5045, Dunedin 9054  |  www.dunedin.govt.nz  |  Ph 03 477 4000' },
  'palmerston-north':    { display: 'Palmerston North City Council',      footer: 'Palmerston North City Council  |  PO Box 1903, Palmerston North 4440  |  www.pncc.govt.nz  |  Ph 06 356 8199' },
  'napier':              { display: 'Napier City Council',                footer: 'Napier City Council Building Consents  |  PO Box 36, Napier 4110  |  www.napier.govt.nz  |  Ph 06 835 7579' },
  'nelson':              { display: 'Nelson City Council',                footer: 'Nelson City Council Building Team  |  PO Box 645, Nelson 7040  |  www.nelson.govt.nz  |  Ph 03 546 0200' },
  'rotorua':             { display: 'Rotorua District Council',           footer: 'Rotorua District Council Building Services  |  PO Box 3029, Rotorua 3046  |  www.rotorualc.nz  |  Ph 07 348 4199' },
  'other':               { display: 'Territorial Authority',              footer: 'Territorial Authority Building Consents' },
};

// Module-level council set before each PDF render
let _renderCouncil = 'auckland';
export function setRenderCouncil(council: string) { _renderCouncil = council; }
export function getCouncilDisplay(council?: string): string {
  return (COUNCIL_CONFIG[council || _renderCouncil] ?? COUNCIL_CONFIG['auckland']).display;
}

// Module-level timezone set before each PDF render — mirrors setRenderCouncil.
// Used only as a fallback "today" when a template isn't given an explicit date.
let _renderTimezone = DEFAULT_TIMEZONE;
export function setRenderTimezone(timezone: string) { _renderTimezone = timezone; }
export function todayFormatted(): string { return formatDate(new Date(), _renderTimezone); }

// ── BRAND COLOURS ─────────────────────────────────────────────────────────────
export const COLORS = {
  headerTeal: '#4a7c59',
  headerBlue: '#1a3c5e',
  bannerBlue: '#1a3c5e',
  bannerBg: '#e8eef4',
  sectionTitle: '#1a3c5e',
  labelText: '#333333',
  bodyText: '#1a4d8c',
  border: '#cccccc',
  lightBorder: '#dddddd',
  councilBg: '#1a3c5e',
  footerBg: '#1a3c5e',
  footerText: '#a8c4d8',
  white: '#ffffff',
  lightGrey: '#f5f5f5',
};

// ── SHARED STYLESHEET ─────────────────────────────────────────────────────────
export const base = StyleSheet.create({
  page: {
    padding: 0,
    paddingBottom: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.bodyText,
    backgroundColor: COLORS.white,
  },
  headerBar: {
    backgroundColor: COLORS.headerBlue,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft:         { flex: 1, paddingRight: 12 },
  headerRight:        { alignItems: 'flex-end', justifyContent: 'center', minWidth: 90 },
  headerCompanyName:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.white, marginBottom: 2 },
  headerCouncil:      { fontSize: 7, color: '#a8d4cc', marginBottom: 3 },
  headerFormType:     { fontSize: 12, fontFamily: 'Helvetica-Bold', color: COLORS.white, marginBottom: 1 },
  headerFormSubtitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#c8e8e4' },
  headerLogo:         { width: 80, height: 38, objectFit: 'contain', marginBottom: 4 },
  headerPsNumber:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.white },
  headerDate:         { fontSize: 7, color: '#a8d4cc', marginTop: 2 },
  instructionBanner: {
    backgroundColor: COLORS.bannerBlue,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  instructionText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  noteBanner:   { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 2 },
  noteText:     { fontSize: 8, fontStyle: 'italic', color: '#555' },
  body:         { paddingHorizontal: 20, paddingTop: 10 },
  fieldRow: {
    flexDirection: 'row',
    borderBottom: `0.5pt solid ${COLORS.lightBorder}`,
    minHeight: 18,
    alignItems: 'flex-start',
  },
  fieldLabel: {
    width: '32%',
    paddingVertical: 3,
    paddingRight: 6,
    fontSize: 8.5,
    color: COLORS.labelText,
  },
  fieldValue: {
    flex: 1,
    paddingVertical: 3,
    fontSize: 8.5,
    color: COLORS.bodyText,
    borderLeft: `0.5pt solid ${COLORS.lightBorder}`,
    paddingLeft: 6,
  },
  fieldValueFull: {
    flex: 1,
    paddingVertical: 3,
    fontSize: 8.5,
    color: COLORS.bodyText,
    paddingLeft: 0,
  },
  fieldRow2Col: {
    flexDirection: 'row',
    borderBottom: `0.5pt solid ${COLORS.lightBorder}`,
    minHeight: 18,
  },
  col2Label: {
    width: '20%',
    paddingVertical: 3,
    paddingRight: 4,
    fontSize: 8.5,
    color: COLORS.labelText,
  },
  col2Value: {
    width: '30%',
    paddingVertical: 3,
    fontSize: 8.5,
    color: COLORS.bodyText,
    borderLeft: `0.5pt solid ${COLORS.lightBorder}`,
    paddingLeft: 6,
    borderRight: `0.5pt solid ${COLORS.lightBorder}`,
    paddingRight: 4,
  },
  declarationBox:  { marginTop: 8, marginBottom: 6, paddingHorizontal: 0 },
  declarationText: { fontSize: 8.5, color: COLORS.bodyText, lineHeight: 1.55, marginBottom: 4 },
  checkItem:       { flexDirection: 'row', marginBottom: 3, alignItems: 'flex-start' },
  checkBox: {
    width: 9,
    height: 9,
    border: `1pt solid ${COLORS.border}`,
    marginRight: 5,
    marginTop: 1,
    flexShrink: 0,
  },
  checkBoxChecked: {
    width: 9,
    height: 9,
    border: `1pt solid ${COLORS.border}`,
    marginRight: 5,
    marginTop: 1,
    flexShrink: 0,
    backgroundColor: COLORS.bannerBlue,
  },
  checkLabel: { flex: 1, fontSize: 8.5, color: COLORS.bodyText, lineHeight: 1.4 },
  clauseRow:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 3, gap: 6 },
  clauseItem: { flexDirection: 'row', alignItems: 'center', marginRight: 6, marginBottom: 2 },
  clauseBox:  { width: 9, height: 9, border: `1pt solid ${COLORS.border}`, marginRight: 3 },
  clauseBoxChecked: {
    width: 9,
    height: 9,
    border: `1pt solid ${COLORS.bannerBlue}`,
    backgroundColor: COLORS.bannerBlue,
    marginRight: 3,
  },
  clauseText: { fontSize: 8, color: COLORS.bodyText },
  signatureSection: { flexDirection: 'row', marginTop: 10, marginBottom: 8, gap: 20 },
  signatureBlock:   { flex: 1 },
  signatureLabel:   { fontSize: 8, color: COLORS.labelText, marginBottom: 2 },
  signatureLine:    { borderBottom: `1pt solid ${COLORS.border}`, height: 30, marginBottom: 2 },
  signatureImage:   { width: 140, height: 40, objectFit: 'contain' },
  signatureSubLabel:{ fontSize: 7, color: '#888' },
  dateBlock:        { width: 120 },
  dateValue:        { fontSize: 9, marginTop: 6 },
  regRow:           { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 4 },
  regLabel:         { fontSize: 8, color: COLORS.labelText, width: 160 },
  regValue: {
    flex: 1,
    fontSize: 8.5,
    color: COLORS.bodyText,
    borderBottom: `0.5pt solid ${COLORS.border}`,
    paddingBottom: 2,
  },
  contactTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.labelText,
    marginTop: 8,
    marginBottom: 4,
  },
  councilBox:        { border: `1pt solid ${COLORS.border}`, marginTop: 10, marginBottom: 2 },
  councilHeader:     { backgroundColor: COLORS.bannerBlue, paddingHorizontal: 10, paddingVertical: 4 },
  councilHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  councilBody:       { padding: 8 },
  councilRow:        { flexDirection: 'row', marginBottom: 5, gap: 10 },
  councilField:      { flex: 1 },
  councilLabel:      { fontSize: 7.5, color: '#666', marginBottom: 2 },
  councilLine:       { borderBottom: `0.5pt solid ${COLORS.border}`, height: 14 },
  councilYesNo:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  yesNoBox: {
    width: 22,
    height: 12,
    border: `0.5pt solid ${COLORS.border}`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yesNoLabel:        { fontSize: 7.5, color: COLORS.labelText },
  councilOfficeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 5 },
  councilOfficeItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  officeBox:         { width: 9, height: 9, border: `0.5pt solid ${COLORS.border}` },
  officeLabel:       { fontSize: 7.5, color: COLORS.labelText },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.footerBg,
    paddingHorizontal: 20,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: { fontSize: 7, color: COLORS.footerText },
  sectionGap: { marginTop: 8 },
  boldText:   { fontFamily: 'Helvetica-Bold' },
  italicText: { fontStyle: 'italic' },
  smallText:  { fontSize: 7.5, color: '#666' },
  divider:    { borderBottom: `0.5pt solid ${COLORS.lightBorder}`, marginVertical: 4 },
  twoCol:     { flexDirection: 'row', gap: 10 },
  col50:      { flex: 1 },
});

// ── HELPER COMPONENTS ─────────────────────────────────────────────────────────
import { View, Text, Image, Document, Page } from '@react-pdf/renderer';

export const FieldRow = ({
  label,
  value,
  noBorder,
}: {
  label: string;
  value?: string | null;
  noBorder?: boolean;
}) =>
  React.createElement(
    View,
    { style: [base.fieldRow, noBorder ? { borderBottom: 'none' } : {}] },
    React.createElement(Text, { style: base.fieldLabel }, label),
    React.createElement(Text, { style: base.fieldValue }, value || ''),
  );

export const FieldRow2Col = ({
  label1, value1, label2, value2,
}: {
  label1: string; value1?: string | null;
  label2: string; value2?: string | null;
}) =>
  React.createElement(
    View,
    { style: base.fieldRow2Col },
    React.createElement(Text, { style: base.col2Label }, label1),
    React.createElement(Text, { style: base.col2Value }, value1 || ''),
    React.createElement(Text, { style: [base.col2Label, { paddingLeft: 6 }] }, label2),
    React.createElement(Text, { style: [base.col2Value, { borderRight: 'none' }] }, value2 || ''),
  );

export const CheckItem = ({
  label, checked, bold,
}: {
  label: string; checked?: boolean; bold?: boolean;
}) =>
  React.createElement(
    View,
    { style: base.checkItem },
    React.createElement(View, { style: checked ? base.checkBoxChecked : base.checkBox }),
    React.createElement(Text, { style: [base.checkLabel, bold ? base.boldText : {}] }, label),
  );

export const ClauseGrid = ({ clauses, selected }: { clauses: string[]; selected?: string[] }) => {
  const sel = new Set(selected || []);
  return React.createElement(
    View,
    { style: base.clauseRow },
    ...clauses.map((c) =>
      React.createElement(
        View,
        { key: c, style: base.clauseItem },
        React.createElement(View, { style: sel.has(c) ? base.clauseBoxChecked : base.clauseBox }),
        React.createElement(Text, { style: base.clauseText }, c),
      ),
    ),
  );
};

export const InstructionBanner = ({ text }: { text: string }) =>
  React.createElement(
    View,
    { style: base.instructionBanner },
    React.createElement(Text, { style: base.instructionText }, text),
  );

const OFFICES_STANDARD = ['Central', 'Henderson', 'Manukau', 'Orewa', 'Papakura', 'Pukekohe', 'Takapuna'];
const OFFICES_CNS = ['Central', 'North West', 'South'];

export const OfficesRow = ({ offices = OFFICES_STANDARD }: { offices?: string[] }) =>
  React.createElement(
    View,
    { style: base.councilOfficeRow },
    ...offices.map((o) =>
      React.createElement(
        View,
        { key: o, style: base.councilOfficeItem },
        React.createElement(View, { style: base.officeBox }),
        React.createElement(Text, { style: base.officeLabel }, o),
      ),
    ),
  );

export const YesNo = () =>
  React.createElement(
    View,
    { style: base.councilYesNo },
    React.createElement(View, { style: base.yesNoBox }, React.createElement(Text, { style: { fontSize: 7 } }, 'YES')),
    React.createElement(View, { style: base.yesNoBox }, React.createElement(Text, { style: { fontSize: 7 } }, 'NO')),
  );

export const SignatureRow = ({
  signatureBase64,
  authorName,
  regNo,
  date,
  signatureLabel = 'Signature:',
  dateLabel = 'Date:',
}: {
  signatureBase64?: string | null;
  authorName?: string;
  regNo?: string;
  date?: string;
  signatureLabel?: string;
  dateLabel?: string;
}) => {
  const today = date || todayFormatted();
  const sigSrc = signatureBase64
    ? signatureBase64.startsWith('data:')
      ? signatureBase64
      : `data:image/png;base64,${signatureBase64}`
    : null;
  return React.createElement(
    View,
    { style: base.signatureSection },
    React.createElement(
      View,
      { style: base.signatureBlock },
      React.createElement(Text, { style: base.signatureLabel }, signatureLabel),
      sigSrc
        ? React.createElement(Image, { style: base.signatureImage, src: sigSrc })
        : React.createElement(View, { style: base.signatureLine }),
      authorName
        ? React.createElement(Text, { style: base.signatureSubLabel }, `${authorName}${regNo ? ` — ${regNo}` : ''}`)
        : null,
    ),
    React.createElement(
      View,
      { style: base.dateBlock },
      React.createElement(Text, { style: base.signatureLabel }, dateLabel),
      React.createElement(Text, { style: base.dateValue }, date || today),
    ),
  );
};

export const CouncilUseOnly = ({
  offices,
  showRegisterChecked = true,
  showRegistrationCurrent = true,
  acceptedLabel = 'Producer statement accepted as establishing compliance with the consented plans:',
  extraRows,
}: {
  offices?: string[];
  showRegisterChecked?: boolean;
  showRegistrationCurrent?: boolean;
  acceptedLabel?: string;
  extraRows?: React.ReactNode;
}) =>
  React.createElement(
    View,
    { style: base.councilBox },
    React.createElement(View, { style: base.councilHeader },
      React.createElement(Text, { style: base.councilHeaderText }, 'COUNCIL USE ONLY'),
    ),
    React.createElement(
      View,
      { style: base.councilBody },
      React.createElement(OfficesRow, { offices }),
      React.createElement(View, { style: base.councilRow },
        React.createElement(View, { style: [base.councilField, { flex: 2 }] },
          React.createElement(Text, { style: base.councilLabel }, 'Received by:'),
          React.createElement(View, { style: base.councilLine }),
        ),
        showRegisterChecked
          ? React.createElement(View, { style: base.councilField },
              React.createElement(Text, { style: base.councilLabel }, 'Register checked:'),
              React.createElement(YesNo, null),
            )
          : null,
      ),
      React.createElement(View, { style: base.councilRow },
        React.createElement(View, { style: [base.councilField, { flex: 2 }] },
          React.createElement(Text, { style: base.councilLabel }, 'Signature:'),
          React.createElement(View, { style: base.councilLine }),
        ),
        showRegistrationCurrent
          ? React.createElement(View, { style: base.councilField },
              React.createElement(Text, { style: base.councilLabel }, 'Registration current:'),
              React.createElement(YesNo, null),
            )
          : null,
      ),
      extraRows || null,
      React.createElement(View, { style: [base.councilRow, { alignItems: 'center' }] },
        React.createElement(Text, { style: [base.councilLabel, { flex: 1, fontSize: 8 }] }, acceptedLabel),
        React.createElement(YesNo, null),
      ),
    ),
  );

export const FooterBar = ({ generated, council }: { generated?: string; council?: string }) => {
  const today = generated || todayFormatted();
  const cfg = COUNCIL_CONFIG[council || _renderCouncil] ?? COUNCIL_CONFIG['auckland'];
  return React.createElement(
    View,
    { style: base.footer, fixed: true },
    React.createElement(Text, { style: base.footerText }, cfg.footer),
    React.createElement(Text, { style: base.footerText }, `Generated: ${today}`),
  );
};

export const HeaderBar = ({
  formCode, formTitle, psNumber, user,
}: {
  formCode: string;
  formTitle: string;
  psNumber?: string;
  user?: Record<string, unknown>;
}) => {
  const psMatch = formCode.match(/^(.+?\(PS[1-4]\))\s*(.*)/i);
  const line3 = psMatch ? psMatch[1] : formCode;
  const formNamePart = psMatch ? psMatch[2].trim() : '';
  const line4 = formNamePart ? `${formNamePart} (${formTitle})` : formTitle;
  const companyName = (user?.company_name || user?.companyName || '') as string;
  const logoUrl = user?.logo_processed_url as string | undefined;

  return React.createElement(
    View,
    { style: base.headerBar },
    React.createElement(
      View,
      { style: base.headerLeft },
      companyName ? React.createElement(Text, { style: base.headerCompanyName }, companyName) : null,
      React.createElement(Text, { style: base.headerCouncil }, `${getCouncilDisplay(user?.council as string | undefined)} — Producer Statement`),
      React.createElement(Text, { style: base.headerFormType }, line3),
      React.createElement(Text, { style: base.headerFormSubtitle }, line4),
    ),
    React.createElement(
      View,
      { style: base.headerRight },
      logoUrl ? React.createElement(Image, { style: base.headerLogo, src: logoUrl }) : null,
      psNumber ? React.createElement(Text, { style: base.headerPsNumber }, psNumber) : null,
    ),
  );
};

export const ALL_CLAUSES_ROW1 = ['B1','B2','C1','C2','C3','C4','C5','C6','D1','D2','E1','E2','E3'];
export const ALL_CLAUSES_ROW2 = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','G1','G2','G3','G4'];
export const ALL_CLAUSES_ROW3 = ['G5','G6','G7','G8','G9','G10','G11','G12','G13','G14','G15','H1'];

export function expandClauseCodes(selected: string[]): string[] {
  const expansions: Record<string, string[]> = {
    'C': ['C1','C2','C3','C4','C5','C6'],
    'F': ['F1','F2','F3','F4','F5','F6','F7','F8','F9'],
    'G': ['G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12','G13','G14','G15'],
  };
  const result: string[] = [];
  for (const code of selected) {
    result.push(...(expansions[code] ?? [code]));
  }
  return result;
}

export { Document, Page, View, Text, Image };
export { OFFICES_STANDARD, OFFICES_CNS };
