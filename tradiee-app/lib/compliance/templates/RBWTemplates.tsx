/**
 * RBWTemplates.tsx
 * Form 2A — Memorandum from LBP (Certificate of Design Work) — Section 30C/45/45AA Building Act 2004
 * Form 6A — Memorandum from LBP (Record of Building Work)    — Section 88 Building Act 2004
 */
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { todayFormatted } from './BaseTemplate';

// ── Shared styles ─────────────────────────────────────────────────────────────
const r = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', paddingTop: 36, paddingBottom: 36, paddingHorizontal: 40 },
  formTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 20, marginBottom: 2 },
  formSubtitle: { fontSize: 16, marginBottom: 4 },
  actRef:       { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 20 },
  sectionHead:  { fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 14, marginBottom: 6 },
  fieldRow:     { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#999', marginBottom: 6, paddingBottom: 4, alignItems: 'flex-start' },
  fieldLabel:   { width: 130, fontSize: 8.5, color: '#444', paddingTop: 1 },
  fieldValue:   { flex: 1, fontSize: 9, color: '#1a1a1a', minHeight: 14 },
  fieldBox:     { flex: 1, borderWidth: 0.5, borderColor: '#999', minHeight: 18, padding: 3, fontSize: 9 },
  tableWrap:    { borderWidth: 0.5, borderColor: '#666', marginTop: 6 },
  tHead:        { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 0.5, borderColor: '#666' },
  tHeadCell:    { padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5, borderRightWidth: 0.5, borderColor: '#666' },
  tSectionRow:  { backgroundColor: '#e8e8e8', padding: 4, borderBottomWidth: 0.5, borderColor: '#666' },
  tSectionTxt:  { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  tRow:         { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#ccc', minHeight: 20 },
  tCell:        { padding: 4, borderRightWidth: 0.5, borderColor: '#ccc', fontSize: 8.5, justifyContent: 'flex-start' },
  tCellLast:    { padding: 4, fontSize: 8.5, justifyContent: 'flex-start' },
  cbBox:        { width: 9, height: 9, borderWidth: 0.75, borderColor: '#333', marginRight: 5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  cbTick:       { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1a1a1a' },
  cbRow:        { flexDirection: 'row', alignItems: 'flex-start' },
  declBox:      { borderWidth: 0.5, borderColor: '#999', padding: 8, marginTop: 8 },
  declText:     { fontSize: 9, lineHeight: 1.5 },
  declRow:      { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5 },
  sigBox:       { borderWidth: 0.5, borderColor: '#999', height: 42, marginTop: 4 },
  sigImg:       { width: '100%', height: 42, objectFit: 'contain' },
  note:         { fontSize: 7.5, fontStyle: 'italic', color: '#555', marginTop: 4 },
});

// ── Helper: labelled field row ───────────────────────────────────────────────
const FR = ({ label, value }: { label: string; value?: string }) =>
  React.createElement(View, { style: r.fieldRow },
    React.createElement(Text, { style: r.fieldLabel }, label),
    React.createElement(Text, { style: r.fieldValue }, value || ''),
  );

// ── Helper: 2-col field row ──────────────────────────────────────────────────
const FR2 = ({ l1, v1, l2, v2 }: { l1: string; v1?: string; l2: string; v2?: string }) =>
  React.createElement(View, { style: { flexDirection: 'row', gap: 12, marginBottom: 6 } },
    React.createElement(View, { style: [r.fieldRow, { flex: 1, marginBottom: 0 }] },
      React.createElement(Text, { style: [r.fieldLabel, { width: 80 }] }, l1),
      React.createElement(Text, { style: r.fieldValue }, v1 || ''),
    ),
    React.createElement(View, { style: [r.fieldRow, { flex: 1, marginBottom: 0 }] },
      React.createElement(Text, { style: [r.fieldLabel, { width: 80 }] }, l2),
      React.createElement(Text, { style: r.fieldValue }, v2 || ''),
    ),
  );

// ── Work item row for Form 2A ────────────────────────────────────────────────
const WorkRow2A = ({ label, item }: { label: string; item?: Record<string, unknown> }) => {
  const checked = item?.checked as boolean | undefined;
  const desc  = (item?.description || '') as string;
  const co    = (item?.carryout || '') as string;
  const pr    = (item?.planref || '') as string;
  return React.createElement(View, { style: r.tRow },
    React.createElement(View, { style: [r.tCell, { width: 130 }] },
      React.createElement(View, { style: r.cbRow },
        React.createElement(View, { style: r.cbBox }, checked ? React.createElement(Text, { style: r.cbTick }, '✓') : null),
        React.createElement(Text, { style: { fontSize: 8.5, flex: 1 } }, label),
      ),
    ),
    React.createElement(View, { style: [r.tCell, { flex: 1 }] }, React.createElement(Text, {}, desc)),
    React.createElement(View, { style: [r.tCell, { width: 90 }] }, React.createElement(Text, {}, co)),
    React.createElement(View, { style: [r.tCellLast, { width: 90 }] }, React.createElement(Text, {}, pr)),
  );
};

// ── Work item row for Form 6A ────────────────────────────────────────────────
const WorkRow6A = ({ label, item }: { label: string; item?: Record<string, unknown> }) => {
  const checked = item?.checked as boolean | undefined;
  const desc  = (item?.description || '') as string;
  const co    = (item?.carryout || '') as string;
  return React.createElement(View, { style: r.tRow },
    React.createElement(View, { style: [r.tCell, { width: 140 }] },
      React.createElement(View, { style: r.cbRow },
        React.createElement(View, { style: r.cbBox }, checked ? React.createElement(Text, { style: r.cbTick }, '✓') : null),
        React.createElement(Text, { style: { fontSize: 8.5, flex: 1 } }, label),
      ),
    ),
    React.createElement(View, { style: [r.tCell, { flex: 1 }] }, React.createElement(Text, {}, desc)),
    React.createElement(View, { style: [r.tCellLast, { width: 110 }] }, React.createElement(Text, {}, co)),
  );
};

const SectionRow = (label: string) =>
  React.createElement(View, { style: r.tSectionRow },
    React.createElement(Text, { style: r.tSectionTxt }, label),
  );

// ── FORM 2A ──────────────────────────────────────────────────────────────────
export const Form2ATemplate = ({
  statement, profile, signature,
}: {
  statement: Record<string, unknown>;
  profile: Record<string, unknown>;
  signature?: string | null;
}) => {
  const d   = (statement?.statement_data || {}) as Record<string, unknown>;
  const wi  = (d.workItems || {}) as Record<string, Record<string, unknown>>;
  const psN = (statement?.ps_number || statement?.doc_number || '') as string;

  const PRIMARY_ITEMS = [
    { key: 'foundations',  label: 'Foundations and subfloor framing' },
    { key: 'walls',        label: 'Walls' },
    { key: 'roof',         label: 'Roof' },
    { key: 'columnsBeams', label: 'Columns and beams' },
    { key: 'bracing',      label: 'Bracing' },
    { key: 'primaryOther', label: 'Other' },
  ];
  const MOISTURE_ITEMS = [
    { key: 'dampProofing',   label: 'Damp proofing' },
    { key: 'roofCladding',   label: 'Roof cladding or roof cladding system' },
    { key: 'ventilation',    label: 'Ventilation system (for example, subfloor or cavity)' },
    { key: 'wallCladding',   label: 'Wall cladding or wall cladding system' },
    { key: 'waterproofing',  label: 'Waterproofing' },
    { key: 'moistureOther',  label: 'Other' },
  ];

  // Pre-fill from profile if statement_data doesn't have them
  const practitionerName = (d.practitionerName || profile?.full_name || '') as string;
  const lbpNumber = (d.lbpNumber || profile?.lbp_number || '') as string;
  const cpengNumber = (d.cpengNumber || profile?.cpeng_number || '') as string;
  const sigSrc = signature
    ? signature.startsWith('data:') ? signature : `data:image/png;base64,${signature}`
    : null;

  return React.createElement(Document, { title: `Form 2A — ${psN}` },
    // PAGE 1
    React.createElement(Page, { size: 'A4', style: r.page },
      React.createElement(Text, { style: r.formTitle }, 'Form 2A:'),
      React.createElement(Text, { style: r.formSubtitle }, 'Memorandum from licensed building practitioner (certificate of design work)'),
      React.createElement(Text, { style: r.actRef }, 'Section 30C, 45, or 45AA, Building Act 2004'),

      React.createElement(Text, { style: r.sectionHead }, 'The building'),
      React.createElement(FR, { label: 'Street address of building:', value: (d.streetAddress || d.project_address) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'The owner'),
      React.createElement(FR, { label: 'Full name:', value: (d.ownerName || d.client_name) as string }),
      React.createElement(FR, { label: 'Mailing address:', value: d.ownerMailingAddress as string }),
      React.createElement(FR2, { l1: 'Telephone number:', v1: d.ownerPhone as string, l2: 'Email address:', v2: (d.ownerEmail || d.client_email) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'Identification of design work that is restricted building work'),
      React.createElement(Text, { style: { fontSize: 8.5, marginBottom: 4 } }, 'I carried out/supervised the following design work that is restricted building work:'),

      React.createElement(View, { style: r.tableWrap },
        React.createElement(View, { style: r.tHead },
          React.createElement(View, { style: [r.tHeadCell, { width: 130 }] }, React.createElement(Text, {}, 'Design work that is restricted building work ✓')),
          React.createElement(View, { style: [r.tHeadCell, { flex: 1 }] }, React.createElement(Text, {}, 'Building work\n(If appropriate, provide details)')),
          React.createElement(View, { style: [r.tHeadCell, { width: 90 }] }, React.createElement(Text, {}, 'Carried out/supervised')),
          React.createElement(View, { style: [r.tHeadCell, { width: 90, borderRightWidth: 0 }] }, React.createElement(Text, {}, 'Reference to plans and specifications')),
        ),
        SectionRow('Primary structure'),
        ...PRIMARY_ITEMS.map(({ key, label }) => React.createElement(WorkRow2A, { key, label, item: wi[key] })),
      ),
    ),

    // PAGE 2
    React.createElement(Page, { size: 'A4', style: r.page },
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', color: '#555', marginBottom: 8 } },
        'Form 2A – Memorandum of Licensed Building Practitioner (Certificate of Design Work)'),

      React.createElement(View, { style: r.tableWrap },
        SectionRow('External moisture management systems'),
        ...MOISTURE_ITEMS.map(({ key, label }) => React.createElement(WorkRow2A, { key, label, item: wi[key] })),
        SectionRow('Fire safety systems'),
        React.createElement(WorkRow2A, { key: 'fireSafety', label: 'Emergency warning systems, evacuation and fire service operation systems, suppression or control systems, or other', item: wi['fireSafety'] }),
      ),

      React.createElement(Text, { style: r.note },
        'Note:\n1. The design of fire safety systems is only restricted building work when it involves small-to-medium apartment buildings.\n2. Continue on another page if necessary.'),

      React.createElement(Text, { style: [r.sectionHead, { marginTop: 16 }] }, 'Waivers or Modifications'),
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 } },
        React.createElement(Text, { style: { fontSize: 9 } }, 'Are waivers or modifications of the building code required?'),
        React.createElement(View, { style: r.cbBox }, d.waiversRequired ? React.createElement(Text, { style: r.cbTick }, '✓') : null),
        React.createElement(Text, { style: { fontSize: 9 } }, 'Yes'),
        React.createElement(View, { style: r.cbBox }, !d.waiversRequired ? React.createElement(Text, { style: r.cbTick }, '✓') : null),
        React.createElement(Text, { style: { fontSize: 9 } }, 'No'),
      ),
    ),

    // PAGE 3
    React.createElement(Page, { size: 'A4', style: r.page },
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', color: '#555', marginBottom: 8 } },
        'Form 2A – Memorandum of Licensed Building Practitioner (Certificate of Design Work)'),

      React.createElement(Text, { style: r.sectionHead }, 'Issued by'),
      React.createElement(FR, { label: '', value: practitionerName }),
      React.createElement(Text, { style: { fontSize: 7.5, color: '#666', marginTop: -6, marginBottom: 6, marginLeft: 130 } },
        '(Name of licensed building practitioner who is licensed to carry out or supervise design work that is restricted building work)'),
      React.createElement(FR, { label: 'Licensed building practitioner number:', value: lbpNumber }),
      React.createElement(FR, { label: 'Chartered professional engineer number:', value: cpengNumber }),
      React.createElement(FR, { label: 'Mailing address:', value: (d.mailingAddress || profile?.address) as string }),
      React.createElement(FR2, { l1: 'Telephone number:', v1: (d.phone || profile?.phone) as string, l2: 'Email address:', v2: (d.email || profile?.email) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'Declaration'),
      React.createElement(View, { style: r.declBox },
        React.createElement(Text, { style: r.declText },
          `I, ${practitionerName || '____________________'}, certify that the design work that is restricted building work recorded on this form:`),
        React.createElement(View, { style: r.declRow },
          React.createElement(View, { style: r.cbBox }, d.declarationChoice === 'a' ? React.createElement(Text, { style: r.cbTick }, '✓') : null),
          React.createElement(Text, { style: [r.declText, { marginLeft: 4 }] }, '(a)  complies with the building code; or'),
        ),
        React.createElement(View, { style: r.declRow },
          React.createElement(View, { style: r.cbBox }, d.declarationChoice === 'b' ? React.createElement(Text, { style: r.cbTick }, '✓') : null),
          React.createElement(Text, { style: [r.declText, { marginLeft: 4, flex: 1 }] },
            '(b)  if applicable, complies with the building code subject to any waiver or modification recorded on this form.'),
        ),
      ),

      React.createElement(View, { style: { marginTop: 14, flexDirection: 'row', gap: 24 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: { fontSize: 9, marginBottom: 4 } }, 'Signature:'),
          React.createElement(View, { style: r.sigBox },
            sigSrc ? React.createElement(Image, { style: r.sigImg, src: sigSrc }) : null,
          ),
          React.createElement(Text, { style: { fontSize: 8, color: '#555', marginTop: 2 } }, practitionerName),
        ),
        React.createElement(View, { style: { width: 160 } },
          React.createElement(Text, { style: { fontSize: 9, marginBottom: 4 } }, 'Date:'),
          React.createElement(View, { style: [r.sigBox, { height: 20 }] },
            React.createElement(Text, { style: { fontSize: 9, padding: 3 } }, (d.date || todayFormatted()) as string),
          ),
        ),
      ),
    ),
  );
};

// ── FORM 6A ──────────────────────────────────────────────────────────────────
export const Form6ATemplate = ({
  statement, profile, signature,
}: {
  statement: Record<string, unknown>;
  profile: Record<string, unknown>;
  signature?: string | null;
}) => {
  const d   = (statement?.statement_data || {}) as Record<string, unknown>;
  const wi  = (d.workItems || {}) as Record<string, Record<string, unknown>>;
  const psN = (statement?.ps_number || statement?.doc_number || '') as string;

  const PRIMARY_ITEMS = [
    { key: 'foundations',  label: 'Foundations and subfloor framing' },
    { key: 'walls',        label: 'Walls' },
    { key: 'roof',         label: 'Roof' },
    { key: 'columnsBeams', label: 'Columns and beams' },
    { key: 'bracing',      label: 'Bracing' },
    { key: 'primaryOther', label: 'Other' },
  ];
  const MOISTURE_ITEMS = [
    { key: 'dampProofing',  label: 'Damp proofing' },
    { key: 'roofCladding',  label: 'Roof cladding or roof cladding system' },
    { key: 'ventilation',   label: 'Ventilation system (for example, subfloor or cavity)' },
    { key: 'wallCladding',  label: 'Wall cladding or wall cladding system' },
    { key: 'waterproofing', label: 'Waterproofing' },
    { key: 'moistureOther', label: 'Other' },
  ];

  const practitionerName = (d.practitionerName || profile?.full_name || '') as string;
  const lbpNumber = (d.lbpNumber || profile?.lbp_number || '') as string;
  const sigSrc = signature
    ? signature.startsWith('data:') ? signature : `data:image/png;base64,${signature}`
    : null;

  const tableHeader6A = React.createElement(View, { style: r.tHead },
    React.createElement(View, { style: [r.tHeadCell, { width: 140 }] }, React.createElement(Text, {}, 'Work that is restricted building work ✓')),
    React.createElement(View, { style: [r.tHeadCell, { flex: 1 }] }, React.createElement(Text, {}, 'Description of restricted building work')),
    React.createElement(View, { style: [r.tHeadCell, { width: 110, borderRightWidth: 0 }] }, React.createElement(Text, {}, 'State whether carried out or supervised')),
  );

  return React.createElement(Document, { title: `Form 6A — ${psN}` },
    // PAGE 1
    React.createElement(Page, { size: 'A4', style: r.page },
      React.createElement(Text, { style: r.formTitle }, 'Form 6A:'),
      React.createElement(Text, { style: r.formSubtitle }, 'Memorandum from licensed building practitioner (record of building work)'),
      React.createElement(Text, { style: r.actRef }, 'Section 88, Building Act 2004'),

      React.createElement(Text, { style: r.sectionHead }, 'The building'),
      React.createElement(FR, { label: 'Street address of building:', value: (d.streetAddress || d.project_address) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'The project'),
      React.createElement(FR, { label: 'Building consent number:', value: (d.consentNumber || d.bc_reference) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'The owner'),
      React.createElement(FR, { label: 'Name of owner:', value: (d.ownerName || d.client_name) as string }),
      React.createElement(FR, { label: 'Mailing address:', value: d.ownerMailingAddress as string }),
      React.createElement(FR2, { l1: 'Telephone number:', v1: d.ownerPhone as string, l2: 'Email address:', v2: (d.ownerEmail || d.client_email) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'Record of work that is restricted building work'),
      React.createElement(View, { style: r.tableWrap },
        tableHeader6A,
        SectionRow('Primary structure'),
        ...PRIMARY_ITEMS.map(({ key, label }) => React.createElement(WorkRow6A, { key, label, item: wi[key] })),
      ),
    ),

    // PAGE 2
    React.createElement(Page, { size: 'A4', style: r.page },
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', color: '#555', marginBottom: 8 } },
        'Form 6A: Memorandum from Licensed Building Practitioner (Record of Building Work)  —  2 of 2'),

      React.createElement(View, { style: r.tableWrap },
        SectionRow('External moisture management systems'),
        ...MOISTURE_ITEMS.map(({ key, label }) => React.createElement(WorkRow6A, { key, label, item: wi[key] })),
      ),
      React.createElement(Text, { style: r.note }, 'Note: Continue on another page if necessary.'),

      React.createElement(Text, { style: r.sectionHead }, 'Issued by'),
      React.createElement(FR, { label: '', value: practitionerName }),
      React.createElement(Text, { style: { fontSize: 7.5, color: '#666', marginTop: -6, marginBottom: 6, marginLeft: 130 } },
        '(Name of licensed building practitioner who is licensed to carry out or supervise restricted building work)'),
      React.createElement(FR, { label: 'Licensed building practitioner number:', value: lbpNumber }),
      React.createElement(FR, { label: 'Class(es) licensed in:', value: d.licensedClass as string }),
      React.createElement(FR, { label: 'Mailing address:', value: (d.mailingAddress || profile?.address) as string }),
      React.createElement(FR2, { l1: 'Telephone number:', v1: (d.phone || profile?.phone) as string, l2: 'Email address:', v2: (d.email || profile?.email) as string }),

      React.createElement(Text, { style: r.sectionHead }, 'Declaration'),
      React.createElement(View, { style: r.declBox },
        React.createElement(Text, { style: r.declText },
          `I, ${practitionerName || '____________________'}, carried out or supervised the restricted building work recorded on this form.`),
      ),

      React.createElement(View, { style: { marginTop: 14, flexDirection: 'row', gap: 24 } },
        React.createElement(View, { style: { width: 160 } },
          React.createElement(Text, { style: { fontSize: 9, marginBottom: 4 } }, 'Date:'),
          React.createElement(View, { style: [r.sigBox, { height: 20 }] },
            React.createElement(Text, { style: { fontSize: 9, padding: 3 } }, (d.date || todayFormatted()) as string),
          ),
        ),
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: { fontSize: 9, marginBottom: 4 } }, 'Signature:'),
          React.createElement(View, { style: r.sigBox },
            sigSrc ? React.createElement(Image, { style: r.sigImg, src: sigSrc }) : null,
          ),
          React.createElement(Text, { style: { fontSize: 8, color: '#555', marginTop: 2 } }, practitionerName),
        ),
      ),
    ),
  );
};
