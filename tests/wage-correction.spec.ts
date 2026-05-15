import { test } from "@playwright/test";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

test("calculate and log wage correction factors", async () => {
  const honMksPath = path.join(process.cwd(), "public/hon-mks202601.csv");
  const contractualPath = path.join(
    process.cwd(),
    "public/contractual_earnings.csv",
  );
  const scheduledPath = path.join(
    process.cwd(),
    "public/scheduled_earnings.csv",
  );
  const totalEarningPath = path.join(process.cwd(), "public/total_earning.csv");

  const content = fs.readFileSync(honMksPath, "utf8");
  const parsed = Papa.parse(content, { header: false, skipEmptyLines: false });
  const tRow = (parsed.data as string[][]).find(
    (row: string[]) => row[0] === "T" && row[1] === "T" && row[2] === "T",
  );

  if (!tRow) throw new Error("T,T,T row not found");

  const total = parseFloat(tRow[12].replace(/,/g, ""));
  const contractual = parseFloat(tRow[13].replace(/,/g, ""));
  const scheduled = parseFloat(tRow[14].replace(/,/g, ""));

  console.log("--- Base Data (2026-01) ---");
  console.log("Total (Real):", total);
  console.log("Contractual (Real):", contractual);
  console.log("Scheduled (Real):", scheduled);

  const ratioScheduled = scheduled / contractual;
  const ratioTotal = total / contractual;

  console.log("--- Derived Ratios ---");
  console.log("Ratio Scheduled (Scheduled/Contractual):", ratioScheduled);
  console.log("Ratio Total (Total/Contractual):", ratioTotal);

  const cContent = fs.readFileSync(contractualPath, "utf8");
  const sContent = fs.readFileSync(scheduledPath, "utf8");
  const tContent = fs.readFileSync(totalEarningPath, "utf8");

  const findIdx = (csvContent: string) => {
    const rows = csvContent.split("\n").map((r) => r.split(","));
    const row = rows.find((r) => r[0]?.trim() === "2026");
    if (!row) return null;
    return parseFloat(row[8].trim().replace(/,/g, ""));
  };

  const contractualIdx = findIdx(cContent);
  const scheduledIdx = findIdx(sContent);
  const totalIdx = findIdx(tContent);

  console.log("--- Index Values (2026-01) ---");
  console.log("Contractual Index:", contractualIdx);
  console.log("Scheduled Index:", scheduledIdx);
  console.log("Total Index:", totalIdx);

  const factorScheduled =
    ratioScheduled * ((contractualIdx || 1) / (scheduledIdx || 1));
  const factorTotal = ratioTotal * ((contractualIdx || 1) / (totalIdx || 1));

  console.log("--- Final Correction Factors ---");
  console.log("Factor Scheduled:", factorScheduled);
  console.log("Factor Total:", factorTotal);
});
