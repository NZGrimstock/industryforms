-- Assemblies: an opt-in mode for a kit where quantities scale from a driving
-- measurement (e.g. "12 m² of wall" → sheets, screws, stopping compound,
-- labour hours) instead of "how many of this fixed bundle". Additive, not a
-- redefinition: kit_items.quantity keeps its existing meaning ("per 1 kit")
-- for every kit that doesn't opt in — is_assembly defaults false, so no
-- existing kit changes behaviour.
--
-- When is_assembly = true: kit_items.quantity means "needed per 1
-- assembly_unit", and waste_pct adds a wastage percentage on top. Component
-- quantity for a real job = driving_qty * kit_items.quantity * (1 + waste_pct/100).
--
-- Not synced via PowerSync — kits/kit_items were never in sync-rules.yaml or
-- the publication (fetched fresh online everywhere, including mobile's
-- addKit()), so no WAL-backfill trap applies to this ALTER TABLE.

alter table kits
  add column if not exists is_assembly boolean not null default false,
  add column if not exists assembly_unit text;
comment on column kits.is_assembly is
  'True: kit_items.quantity is "per 1 assembly_unit" and a driving quantity is entered when using the kit, instead of "how many of this kit".';
comment on column kits.assembly_unit is
  'e.g. "m²", "lm", "each" — the unit the driving quantity is entered in. Only meaningful when is_assembly is true.';

alter table kit_items
  add column if not exists waste_pct numeric(5,2);
comment on column kit_items.waste_pct is
  'Wastage % added on top of the formula quantity, e.g. 10 for 10% extra sheet material. Only meaningful when the parent kit is an assembly; null/0 elsewhere.';
