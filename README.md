# PKL Rent Intelligence

Premium rental pricing intelligence demo for **PKL Management LLC**.

Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn-style Radix UI, Lucide, and Recharts. Opens directly into the portfolio dashboard — no auth, no database, no paid APIs.

## Demo journey

1. **Portfolio** → featured 30 Veterans Memorial Parkway  
2. **Property** → available units & amenities  
3. **Comparables** → nine 1BR comps from the source report  
4. **Pricing** → interactive rent adjustments + charts  
5. **Generate PDF** → branded downloadable pricing analysis  
6. **Report history / scheduling** → localStorage-backed demo state  

## Stack

- Next.js 16 + React 19 + TypeScript  
- Tailwind CSS 4  
- Radix UI primitives (shadcn-style)  
- Recharts, jsPDF, SheetJS (`xlsx`), Papa Parse  
- Zustand + localStorage persistence  

## Local development

Requires **Node.js 20.9+**.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
npm start
```

## Vercel deployment

1. Push this repository to GitHub.  
2. Import the project in [Vercel](https://vercel.com/new).  
3. Framework preset: **Next.js** (detected automatically).  
4. Build command: `npm run build` · Output: default Next.js.  
5. Deploy — no environment variables required.

## Sample vs live data

| Area | Behavior |
|------|----------|
| Portfolio (100+ buildings / 500+ units) | Illustrative generated sample |
| 30 Veterans details, 9 comps, leads, recommendation | From `references/30-veterans-pricing-report.docx` |
| CSV / Excel upload | Real client-side parsing |
| PDF upload | Clearly simulated AI extraction |
| PDF report download | Real jsPDF generation |
| Scheduling | Simulated cadence only (no email) |
| Zillow / Apartments.com | Sample metrics; listing links open live sites |

Property imagery uses Unsplash placeholders (not building-specific photography).

## Project structure

```
src/
  app/                 # App Router pages
  components/          # UI, layout, charts, feature widgets
  data/                # Types, Veterans report data, portfolio seed
  lib/                 # utils, PDF generator, upload parsers
  store/               # Zustand + localStorage demo store
references/            # Source pricing report (docx)
```
