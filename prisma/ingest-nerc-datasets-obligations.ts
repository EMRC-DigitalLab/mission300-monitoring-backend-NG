import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, DatasetFieldType } from "@prisma/client";

/**
 * Turns each sheet of the compiled NERC workbook into a reporting Dataset:
 * a downloadable XLSX template, the fields behind it, and the obligation
 * telling a given institution to file it for a given period.
 *
 * One sheet = one Dataset. The workbook is NERC's own reporting
 * requirement, so NERC owns every dataset definition; the institutions that
 * actually file differ:
 * - the 10 DisCo sheets are filed by each of the 12 DisCos
 * - the 2 GenCo sheets are filed by NISO / TCN, the system operator that
 *   reports generation
 *
 * Field selection follows from what an obligation already pins. An
 * obligation is institution x dataset x reporting period, so the sheet's
 * Disco/Year/Month columns are not asked for again - only the measures are.
 * Where a sheet varies *within* one institution and period, that dimension
 * does become fields: "Disco Metering" splits by Customer_Type, so it asks
 * for metered and unmetered counts separately.
 *
 * The two GenCo sheets are per-plant in the source workbook, which a
 * single-row obligation template cannot hold. They are defined here as the
 * national totals the KPIs actually consume (M300-P1-002, M300-P1-016) -
 * the same figures ingest-nerc-genco-kpis.ts derives by summing/averaging
 * plants. Per-plant detail stays with the bulk workbook import; it is not
 * something this per-institution manual-entry path collects.
 *
 * Each field is linked to the KPI its value ultimately feeds, so an
 * approved submission flows through to the dashboards rather than sitting
 * in a table nobody reads.
 *
 * Obligations are created for the most recently *closed* period only, at
 * each dataset's own cadence - the period a filer would actually be working
 * on now. Earlier periods are deliberately not generated: the historical
 * figures already arrived through the bulk workbook import, and back-filling
 * obligations for them would post years of overdue notices for returns
 * nobody is going to file through this platform retrospectively.
 *
 * A consequence worth knowing: the monthly datasets land as "due" (the
 * month just closed), while the quarterly and annual ones land as overdue,
 * because their deadlines genuinely passed before the platform was carrying
 * them. That is an accurate reflection of what has not been filed here, not
 * a seeding artefact.
 *
 * Idempotent: datasets upsert by deterministic id, fields are replaced, and
 * obligations upsert on the (institution, dataset, period) unique key.
 *
 * Run with: DATABASE_URL=... node dist/prisma/ingest-nerc-datasets-obligations.js
 */

const NERC_INSTITUTION_ID = "seed-institution-nerc";
const NERC_INSTITUTION_NAME = "Nigerian Electricity Regulatory Commission (NERC)";
const NISO_INSTITUTION_ID = "seed-institution-niso-tcn";
const NISO_INSTITUTION_NAME = "NISO / TCN";

const DISCO_NAMES = [
  "Abuja Electricity Distribution Company",
  "Benin Electricity Distribution Company",
  "Eko Electricity Distribution Company",
  "Enugu Electricity Distribution Company",
  "Ibadan Electricity Distribution Company",
  "Ikeja Electric",
  "Jos Electricity Distribution Company",
  "Kaduna Electricity Distribution Company",
  "Kano Electricity Distribution Company",
  "Port Harcourt Electricity Distribution Company",
  "Yola Electricity Distribution Company",
  "Aba Power Limited",
];

function discoInstitutionId(fullName: string): string {
  return `seed-disco-${fullName.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

type Cadence = "Monthly" | "Quarterly" | "Annual";
type Filer = "disco" | "niso";

interface FieldSpec {
  label: string;
  helpText: string;
  unit: string;
  kpiCode: string | null;
}

interface DatasetSpec {
  id: string;
  sheet: string;
  name: string;
  purpose: string;
  frequency: Cadence;
  filedBy: Filer;
  pillarSlug: string;
  sectionTitle: string;
  fields: FieldSpec[];
}

const DATASETS: DatasetSpec[] = [
  {
    id: "nerc-disco-energy-received",
    sheet: "Disco Energy Recieved",
    name: "DisCo Energy Received",
    purpose: "Energy delivered into each Distribution Company's network, the input side of the ATC&C loss calculation.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Energy accounting",
    fields: [
      {
        label: "Energy Received (GWh)",
        helpText: "Total energy delivered into your network for the reporting month.",
        unit: "GWh",
        kpiCode: "M300-P3-006",
      },
    ],
  },
  {
    id: "nerc-disco-energy-billed",
    sheet: "Disco Energy Billed",
    name: "DisCo Energy Billed",
    purpose: "Energy billed to customers, the output side of the ATC&C loss calculation.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Energy accounting",
    fields: [
      {
        label: "Energy Billed (GWh)",
        helpText: "Total energy billed to customers for the reporting month.",
        unit: "GWh",
        kpiCode: "M300-P3-006",
      },
    ],
  },
  {
    id: "nerc-disco-revenue-billed",
    sheet: "Disco Revenue Billed",
    name: "DisCo Revenue Billed",
    purpose: "Revenue invoiced to customers, the denominator of collection efficiency.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Revenue and collections",
    fields: [
      {
        label: "Revenue Billed (NGN million)",
        helpText: "Total revenue invoiced to customers for the reporting month.",
        unit: "NGN million",
        kpiCode: "M300-P3-008",
      },
    ],
  },
  {
    id: "nerc-disco-revenue-collected",
    sheet: "Disco Revenue Collected",
    name: "DisCo Revenue Collected",
    purpose: "Revenue actually collected from customers, feeding collection efficiency and the ATC&C loss rate.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Revenue and collections",
    fields: [
      {
        label: "Revenue Collected (NGN million)",
        helpText: "Total revenue collected from customers for the reporting month.",
        unit: "NGN million",
        kpiCode: "M300-P3-007",
      },
    ],
  },
  {
    id: "nerc-disco-metering",
    sheet: "Disco Metering",
    name: "DisCo Metering",
    purpose: "Metered and unmetered customer counts, behind the national metering rate and metering gap.",
    frequency: "Quarterly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Metering performance",
    fields: [
      {
        label: "Metered Customers",
        helpText: "Active customers with a working meter at the end of the quarter.",
        unit: "customers",
        kpiCode: "M300-P3-001",
      },
      {
        label: "Unmetered Customers",
        helpText: "Active customers still without a meter at the end of the quarter.",
        unit: "customers",
        kpiCode: "M300-P3-002",
      },
    ],
  },
  {
    id: "nerc-disco-allowed-tariffs",
    sheet: "Disco Allowed Tariffs",
    name: "DisCo Allowed Tariffs",
    purpose: "The MYTO-approved allowed tariff per DisCo, behind the national cost-reflective tariff figure.",
    frequency: "Annual",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "MYTO tariff orders",
    fields: [
      {
        label: "Allowed Tariff (NGN/kWh)",
        helpText: "The MYTO-approved allowed tariff applying to your franchise for the year.",
        unit: "NGN/kWh",
        kpiCode: "M300-P3-012",
      },
    ],
  },
  {
    id: "nerc-disco-mo-invoice",
    sheet: "Disco MO Invoice",
    name: "DisCo Market Operator Invoice",
    purpose: "Market Operator invoice raised against each DisCo, the obligation side of market remittance.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Market remittance",
    fields: [
      {
        label: "Invoice from Market Operator (NGN billion)",
        helpText: "Market Operator invoice raised against your DisCo for the reporting month.",
        unit: "NGN billion",
        kpiCode: "M300-P3-009",
      },
    ],
  },
  {
    id: "nerc-disco-mo-remittance",
    sheet: "Disco MO Remittances",
    name: "DisCo Market Operator Remittance",
    purpose: "Amount actually remitted to the Market Operator, the payment side of market remittance.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Market remittance",
    fields: [
      {
        label: "Remittance to Market Operator (NGN billion)",
        helpText: "Amount actually remitted to the Market Operator for the reporting month.",
        unit: "NGN billion",
        kpiCode: "M300-P3-009",
      },
    ],
  },
  {
    id: "nerc-disco-nbet-invoice",
    sheet: "Disco NBET Invoice",
    name: "DisCo NBET Invoice",
    purpose: "NBET invoice raised against each DisCo, the obligation side of generation-cost remittance.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Market remittance",
    fields: [
      {
        label: "Invoice from NBET (NGN billion)",
        helpText: "NBET invoice raised against your DisCo for the reporting month.",
        unit: "NGN billion",
        kpiCode: "M300-P3-009",
      },
    ],
  },
  {
    id: "nerc-disco-nbet-remittance",
    sheet: "Disco NBET Remittances",
    name: "DisCo NBET Remittance",
    purpose: "Amount actually remitted to NBET, the payment side of generation-cost remittance.",
    frequency: "Monthly",
    filedBy: "disco",
    pillarSlug: "financially-viable-utilities",
    sectionTitle: "Market remittance",
    fields: [
      {
        label: "Remittance to NBET (NGN billion)",
        helpText: "Amount actually remitted to NBET for the reporting month.",
        unit: "NGN billion",
        kpiCode: "M300-P3-009",
      },
    ],
  },
  {
    id: "nerc-genco-installed-capacity",
    sheet: "Genco Installed Capacity",
    name: "Generation Installed Capacity",
    purpose: "National installed generation capacity. Per-plant detail arrives through the bulk workbook import; this return captures the national total the Compact tracks.",
    frequency: "Annual",
    filedBy: "niso",
    pillarSlug: "generation-network",
    sectionTitle: "Generation capacity",
    fields: [
      {
        label: "Installed Generation Capacity (MW)",
        helpText: "National installed nameplate capacity across all connected generating plants.",
        unit: "MW",
        kpiCode: "M300-P1-002",
      },
    ],
  },
  {
    id: "nerc-genco-available-capacity",
    sheet: "Genco AVG Avail. Capacity",
    name: "Generation Available Capacity",
    purpose: "Average GenCo-declared available capacity for the period. Per-plant detail arrives through the bulk workbook import; this return captures the national average the Compact tracks.",
    frequency: "Monthly",
    filedBy: "niso",
    pillarSlug: "generation-network",
    sectionTitle: "Generation capacity",
    fields: [
      {
        label: "Average Available Capacity (MW)",
        helpText: "Average declared available capacity across all generating plants for the reporting month.",
        unit: "MW",
        kpiCode: "M300-P1-016",
      },
    ],
  },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The period a filer would currently be working on, and the date it is due.
 *
 * Each cadence reports the period that has just closed, due 15 days after
 * it ends - the same convention the existing seed obligation uses.
 */
function currentPeriod(frequency: Cadence, now: Date): { reportingPeriod: string; dueDate: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (frequency === "Monthly") {
    const closed = new Date(Date.UTC(year, month - 1, 1));
    return {
      reportingPeriod: `${MONTH_NAMES[closed.getUTCMonth()]} ${closed.getUTCFullYear()}`,
      dueDate: new Date(Date.UTC(closed.getUTCFullYear(), closed.getUTCMonth() + 1, 15)),
    };
  }

  if (frequency === "Quarterly") {
    const closedQuarterStartMonth = Math.floor(month / 3) * 3 - 3;
    const closed = new Date(Date.UTC(year, closedQuarterStartMonth, 1));
    const quarter = Math.floor(closed.getUTCMonth() / 3) + 1;
    return {
      reportingPeriod: `Q${quarter} ${closed.getUTCFullYear()}`,
      dueDate: new Date(Date.UTC(closed.getUTCFullYear(), closed.getUTCMonth() + 3, 15)),
    };
  }

  return {
    reportingPeriod: String(year - 1),
    dueDate: new Date(Date.UTC(year, 0, 31)),
  };
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

  const nerc = await prisma.institution.upsert({
    where: { id: NERC_INSTITUTION_ID },
    create: { id: NERC_INSTITUTION_ID, name: NERC_INSTITUTION_NAME, type: "Regulator" },
    update: {},
  });
  const niso = await prisma.institution.upsert({
    where: { id: NISO_INSTITUTION_ID },
    create: { id: NISO_INSTITUTION_ID, name: NISO_INSTITUTION_NAME, type: "Federal Agency" },
    update: {},
  });

  const discos = [];
  for (const name of DISCO_NAMES) {
    const id = discoInstitutionId(name);
    discos.push(
      await prisma.institution.upsert({
        where: { id },
        create: { id, name, type: "Disco" },
        update: {},
      }),
    );
  }

  const now = new Date();
  let datasetCount = 0;
  let fieldCount = 0;
  let obligationCount = 0;

  for (const spec of DATASETS) {
    const pillar = await prisma.pillar.findUnique({ where: { slug: spec.pillarSlug } });
    if (!pillar) throw new Error(`Pillar "${spec.pillarSlug}" not found - run ingest-kpi-directory.js first.`);

    const templateFileName = `${spec.id}.xlsx`;
    const datasetData = {
      name: spec.name,
      purpose: spec.purpose,
      pillarId: pillar.id,
      requiredDataPoints: spec.fields.map((field) => field.label),
      frequency: spec.frequency,
      ownerInstitutionId: nerc.id,
      templateFileName,
      isActive: true,
    };

    const dataset = await prisma.dataset.upsert({
      where: { id: spec.id },
      create: { id: spec.id, ...datasetData },
      update: datasetData,
    });
    datasetCount++;

    // Replace-all so a changed spec never leaves an orphaned field behind.
    await prisma.datasetField.deleteMany({ where: { datasetId: dataset.id } });
    for (const [index, field] of spec.fields.entries()) {
      const kpi = field.kpiCode
        ? await prisma.kpiDefinition.findUnique({ where: { code: field.kpiCode } })
        : null;
      if (field.kpiCode && !kpi) {
        throw new Error(`KPI ${field.kpiCode} not found for dataset ${spec.id}.`);
      }
      await prisma.datasetField.create({
        data: {
          id: `${spec.id}-field-${index + 1}`,
          datasetId: dataset.id,
          sectionId: spec.sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          sectionTitle: spec.sectionTitle,
          label: field.label,
          helpText: field.helpText,
          type: DatasetFieldType.NUMBER,
          required: true,
          unit: field.unit,
          order: index + 1,
          kpiDefinitionId: kpi?.id ?? null,
        },
      });
      fieldCount++;
    }

    const { reportingPeriod, dueDate } = currentPeriod(spec.frequency, now);
    const filers = spec.filedBy === "disco" ? discos : [niso];
    for (const filer of filers) {
      await prisma.obligation.upsert({
        where: {
          institutionId_datasetId_reportingPeriod: {
            institutionId: filer.id,
            datasetId: dataset.id,
            reportingPeriod,
          },
        },
        create: {
          institutionId: filer.id,
          datasetId: dataset.id,
          reportingPeriod,
          dueDate,
        },
        update: { dueDate },
      });
      obligationCount++;
    }
  }

  console.log(
    `Datasets: ${datasetCount} upserted. Fields: ${fieldCount}. Obligations: ${obligationCount}.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
