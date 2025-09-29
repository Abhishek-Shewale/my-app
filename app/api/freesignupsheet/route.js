import { NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { getCache, setCache, makeCacheKey } from "../../../lib/serverCache";

/* -------------------- Helpers -------------------- */

function getServiceAccount() {
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let private_key = process.env.GOOGLE_PRIVATE_KEY;

  if (!client_email || !private_key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY"
    );
  }
  private_key = private_key.replace(/\\n/g, "\n");
  return { client_email, private_key };
}

const parseSheetDate = (sheetName) => {
  try {
    const parts = sheetName.trim().split("-");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      const dt = new Date(`${year}-${month}-${day}`);
      if (!isNaN(dt.getTime())) {
        console.log(`✓ Parsed sheet date: ${sheetName} -> ${dt.toISOString().split('T')[0]}`);
        return dt;
      }
    }
    console.log(`✗ Could not parse sheet date: ${sheetName}`);
    return null;
  } catch (err) {
    console.log(`✗ Error parsing sheet date: ${sheetName}`, err.message);
    return null;
  }
};

const formatTimestamp = (ts) => {
  if (!ts) return null;
  try {
    let d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();

    const parts = ts.toString().trim().split(" ");
    const datePart = parts[0];
    const timePart = parts.slice(1).join(" ") || "00:00:00";
    const dparts = datePart.split("-");
    if (dparts.length === 3) {
      const day = dparts[0].padStart(2, "0");
      const month = dparts[1].padStart(2, "0");
      const year = dparts[2];
      const normTime =
        timePart.split(":").length === 2 ? `${timePart}:00` : timePart;
      d = new Date(`${year}-${month}-${day}T${normTime}`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    return null;
  } catch {
    return null;
  }
};

const countBy = (arr, keyFn) => {
  const counts = {};
  arr.forEach((r) => {
    try {
      const raw = keyFn(r) ?? "Not provided";
      const key = raw.toString().trim() || "Not provided";
      counts[key] = (counts[key] || 0) + 1;
    } catch {
      counts["Not provided"] = (counts["Not provided"] || 0) + 1;
    }
  });
  return counts;
};

const processSheetRows = (rows) => {
  if (!rows || rows.length === 0) {
    return {
      title: "WhatsApp / Registration Analytics",
      data: [],
      summary: [],
      rawStats: {
        totalContacts: 0,
        languages: {},
        boards: {},
        grades: {},
        status: {},
        sources: {},
        demoStatus: {},
        demoRequested: {},
        currentStatus: {},
        salesOwners: {},
        assignedTo: {},
      },
    };
  }

  const totalContacts = rows.length;
  const languages = countBy(rows, (r) => r.get("Language"));
  const boards = countBy(rows, (r) => r.get("Board"));
  const grades = countBy(rows, (r) => r.get("Grade"));
  const status = countBy(rows, (r) => r.get("Status"));
  const sources = countBy(rows, (r) => r.get("Source") || r.get("Lead Source"));
  const demoStatus = countBy(
    rows,
    (r) => r.get("Demo Status") || r.get("DemoStatus")
  );
  const demoRequested = countBy(
    rows,
    (r) =>
      r.get("Demo Requested") ||
      r.get("Demo Request") ||
      r.get("DemoRequested") ||
      r.get("Demo Request?")
  );
  const currentStatus = countBy(rows, (r) => r.get("Current Status"));
  const salesOwners = countBy(rows, (r) => r.get("Sales Owner"));
  const assignedToCounts = countBy(rows, (r) => r.get("Assigned To"));

  return {
    title: "WhatsApp / Registration Analytics",
    data: [{ name: "Total Contacts", value: totalContacts }],
    summary: [
      { label: "Total Contacts", value: totalContacts },
      { label: "Unique Languages", value: Object.keys(languages).length },
      { label: "Unique Boards", value: Object.keys(boards).length },
      { label: "Unique Grades", value: Object.keys(grades).length },
      { label: "Unique Sources", value: Object.keys(sources).length },
      { label: "Unique Demo Statuses", value: Object.keys(demoStatus).length },
      {
        label: "Unique Demo Requests",
        value: Object.keys(demoRequested).length,
      },
      {
        label: "Unique Current Statuses",
        value: Object.keys(currentStatus).length,
      },
      {
        label: "Unique Assigned To",
        value: Object.keys(assignedToCounts).length,
      },
    ],
    rawStats: {
      totalContacts,
      languages,
      boards,
      grades,
      status,
      sources,
      demoStatus,
      demoRequested,
      currentStatus,
      salesOwners,
      assignedTo: assignedToCounts,
    },
  };
};

/* -------------------- API Route -------------------- */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId = searchParams.get("spreadsheetId");
    const dateRangeParam = searchParams.get("dateRange") || "7";
    const specificDate = searchParams.get("date");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const monthYearParam = searchParams.get("monthYear");
    const debug = searchParams.get("debug") === "1";
    const fieldsParam = searchParams.get("fields");
    const fields = fieldsParam
      ? fieldsParam
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      : null;
    const cacheTtl = Math.max(
      0,
      parseInt(searchParams.get("cacheTtl") || "300", 10)
    );
    const sheetDelayMs = Math.max(
      0,
      parseInt(searchParams.get("sheetDelayMs") || "1500", 10) // Increased to 1.5 seconds
    );
    const maxRetries = Math.max(
      0,
      parseInt(searchParams.get("maxRetries") || "5", 10) // Increased to 5
    );
    const initialDelayMs = Math.max(
      100,
      parseInt(searchParams.get("initialDelayMs") || "1000", 10) // Increased to 1 second
    );
    const jitterMs = Math.max(
      0,
      parseInt(searchParams.get("jitterMs") || "500", 10) // Increased to 500ms
    );

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    const cacheKey = makeCacheKey([
      "freesignupsheet",
      spreadsheetId,
      String(dateRangeParam),
      specificDate || "",
      monthParam || "",
      yearParam || "",
      monthYearParam || "",
      fields ? fields.sort().join(",") : "__all__",
    ]);
    // Only return cached data if it's complete
    const cached = getCache(cacheKey);
    if (cached && cached.isComplete) {
      console.log(`Returning cached complete data: ${cached.totalRows} rows from ${cached.metadata?.totalSheetsProcessed} sheets`);
      return NextResponse.json(cached);
    }

    const { client_email, private_key } = getServiceAccount();

    let doc = new GoogleSpreadsheet(spreadsheetId);
    try {
      if (typeof doc.useServiceAccountAuth === "function") {
        await doc.useServiceAccountAuth({ client_email, private_key });
      } else {
        const jwtClient = new JWT({
          email: client_email,
          key: private_key,
          scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
          ],
        });
        await jwtClient.authorize();
        if (typeof doc.useOAuth2Client === "function") {
          await doc.useOAuth2Client(jwtClient);
        } else {
          doc = new GoogleSpreadsheet(spreadsheetId, jwtClient);
        }
      }
      await doc.loadInfo();
    } catch (authErr) {
      console.error("Google Sheets auth error:", authErr);
      return NextResponse.json(
        { error: "Google Sheets authentication failed" },
        { status: 500 }
      );
    }

    const allSheets = Object.values(doc.sheetsByTitle || {});
    const dateSheets = allSheets
      .map((s) => ({ sheet: s, date: parseSheetDate(s.title) }))
      .filter((x) => x.date !== null);

    // Debug logging
    console.log(`\n=== Sheet Analysis ===`);
    console.log(`Total sheets in spreadsheet: ${allSheets.length}`);
    console.log(`All sheets found:`, allSheets.map(s => s.title));
    console.log(`Date sheets found:`, dateSheets.map(s => s.sheet.title));
    console.log(`Date sheets with parsed dates:`, dateSheets.map(s => ({ 
      title: s.sheet.title, 
      date: s.date.toISOString().split('T')[0] 
    })));
    console.log(`Request parameters:`, {
      specificDate,
      monthYearParam,
      monthParam,
      yearParam,
      dateRangeParam
    });

    let targetTitles = [];

    if (specificDate) {
      // Validate that the specific date sheet actually exists
      if (doc.sheetsByTitle[specificDate]) {
        targetTitles = [specificDate];
        console.log(`✓ Specific date sheet found: ${specificDate}`);
      } else {
        console.warn(`⚠ Specific date sheet not found: ${specificDate}`);
        console.log(`Available sheets:`, Object.keys(doc.sheetsByTitle));
        return NextResponse.json(
          { 
            error: `Sheet '${specificDate}' not found`,
            availableSheets: Object.keys(doc.sheetsByTitle)
          },
          { status: 404 }
        );
      }
    } else if (monthYearParam) {
      const parts = monthYearParam.split("-");
      let mon, yr;
      
      // Handle both MM-YYYY and YYYY-MM formats
      if (parts.length === 2) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        
        // If first part is > 12, it's likely YYYY-MM format
        if (first > 12 && second <= 12) {
          yr = first;
          mon = second;
        } else if (first <= 12 && second > 12) {
          // MM-YYYY format
          mon = first;
          yr = second;
        } else {
          return NextResponse.json(
            { error: "Invalid monthYear parameter (expected MM-YYYY or YYYY-MM)" },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Invalid monthYear parameter format" },
          { status: 400 }
        );
      }
      
      if (!isNaN(mon) && mon >= 1 && mon <= 12 && !isNaN(yr)) {
        console.log(`Filtering sheets for month: ${mon}, year: ${yr}`);
        targetTitles = dateSheets
          .filter(
            (s) => s.date.getMonth() + 1 === mon && s.date.getFullYear() === yr
          )
          .map((s) => s.sheet.title)
          .sort((a, b) => parseSheetDate(b) - parseSheetDate(a));
        console.log(`Found ${targetTitles.length} sheets for ${mon}/${yr}:`, targetTitles);
      } else {
        return NextResponse.json(
          { error: "Invalid month or year values" },
          { status: 400 }
        );
      }
    } else if (monthParam && yearParam) {
      const mon = parseInt(monthParam, 10);
      const yr = parseInt(yearParam, 10);
      if (!isNaN(mon) && mon >= 1 && mon <= 12 && !isNaN(yr)) {
        targetTitles = dateSheets
          .filter(
            (s) => s.date.getMonth() + 1 === mon && s.date.getFullYear() === yr
          )
          .map((s) => s.sheet.title)
          .sort((a, b) => parseSheetDate(b) - parseSheetDate(a));
      } else {
        return NextResponse.json(
          { error: "Invalid month/year parameters" },
          { status: 400 }
        );
      }
    } else {
      const days = Math.max(1, parseInt(dateRangeParam, 10) || 7);
      targetTitles = dateSheets
        .slice()
        .sort((a, b) => b.date - a.date)
        .slice(0, days)
        .map((s) => s.sheet.title);
    }

    // Filter out any sheets that don't actually exist
    const validTargetTitles = targetTitles.filter(title => doc.sheetsByTitle[title]);
    const invalidTitles = targetTitles.filter(title => !doc.sheetsByTitle[title]);
    
    if (invalidTitles.length > 0) {
      console.warn(`⚠ Removing non-existent sheets from target list:`, invalidTitles);
    }
    
    // Additional filter: Remove any sheets that we know don't exist
    const knownInvalidSheets = ['09-09-2025'];
    const finalTargetTitles = validTargetTitles.filter(title => !knownInvalidSheets.includes(title));
    const removedKnownInvalid = validTargetTitles.filter(title => knownInvalidSheets.includes(title));
    
    if (removedKnownInvalid.length > 0) {
      console.warn(`⚠ Removing known invalid sheets:`, removedKnownInvalid);
    }
    
    targetTitles = finalTargetTitles;
    
    console.log(`Target sheets selected:`, targetTitles);
    console.log(`Number of target sheets: ${targetTitles.length}`);
    
    // If no target sheets found, return error
    if (targetTitles.length === 0) {
      console.error(`No valid sheets found for the requested parameters`);
      return NextResponse.json(
        { 
          error: "No valid sheets found for the requested parameters",
          availableSheets: Object.keys(doc.sheetsByTitle),
          requestParams: {
            specificDate,
            monthYearParam,
            monthParam,
            yearParam,
            dateRangeParam
          }
        },
        { status: 404 }
      );
    }

    const getRowsWithRetry = async (sheet) => {
      let attempt = 0;
      let delayMs = initialDelayMs;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (;;) {
        try {
          return await sheet.getRows();
        } catch (err) {
          const msg = typeof err?.message === "string" ? err.message : "";
          const is429 =
            err?.status === 429 ||
            msg.includes("429") ||
            msg.includes("Quota") ||
            msg.includes("Rate") ||
            msg.includes("limit");
          if (attempt < maxRetries && is429) {
            const jitter = Math.floor(Math.random() * jitterMs);
            await sleep(delayMs + jitter);
            attempt += 1;
            delayMs = Math.min(delayMs * 2, 15000);
            continue;
          }
          throw err;
        }
      }
    };

    // Track expected vs actual data for validation
    const expectedSheets = targetTitles.length;
    let processedSheets = [];
    let allRows = [];
    let hasErrors = false;
    let failedSheets = [];

    console.log(`Starting to process ${expectedSheets} sheets with ${sheetDelayMs}ms delay between requests`);
    console.log(`Expected to complete in approximately ${(expectedSheets * sheetDelayMs) / 1000} seconds`);

    for (let i = 0; i < targetTitles.length; i++) {
      const title = targetTitles[i];
      const sheet = doc.sheetsByTitle[title];
      
      if (!sheet) {
        console.warn(`⚠ Sheet not found: ${title}`);
        console.log(`Available sheets:`, Object.keys(doc.sheetsByTitle));
        console.log(`This should not happen - sheet was filtered out earlier.`);
        failedSheets.push({ title, error: 'Sheet not found' });
        hasErrors = true;
        continue;
      }

      console.log(`Processing sheet ${i + 1}/${expectedSheets}: ${title}`);
      
      try {
        // Check if sheet has any data first
        const rows = await getRowsWithRetry(sheet);
        if (rows && rows.length > 0) {
          allRows.push(...rows);
          processedSheets.push({ title, rowCount: rows.length, success: true });
          console.log(`✓ Successfully processed ${title}: ${rows.length} rows`);
        } else {
          console.log(`⚠ Sheet ${title} has no data rows`);
          processedSheets.push({ title, rowCount: 0, success: true });
        }
      } catch (err) {
        hasErrors = true;
        failedSheets.push({ title, error: err.message });
        
        if (
          err &&
          typeof err.message === "string" &&
          err.message.includes("No values in the header row")
        ) {
          console.warn(
            `⚠ Skipping sheet ${title}: missing header row (first row has no values).`
          );
        } else {
          console.error(`✗ Error loading sheet ${title}:`, err.message);
        }
      }

      // Add delay between sheets (except for the last one)
      if (i < targetTitles.length - 1) {
        const jitter = Math.floor(
          Math.random() * Math.max(1, Math.floor(jitterMs / 2))
        );
        const delay = sheetDelayMs + jitter;
        console.log(`Waiting ${delay}ms before next sheet...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Data validation
    const isDataComplete = !hasErrors && processedSheets.length === expectedSheets;
    const completionPercentage = Math.round((processedSheets.length / expectedSheets) * 100);
    
    console.log(`\n=== Processing Summary ===`);
    console.log(`Expected sheets: ${expectedSheets}`);
    console.log(`Successfully processed: ${processedSheets.length}`);
    console.log(`Failed sheets: ${failedSheets.length}`);
    console.log(`Completion: ${completionPercentage}%`);
    console.log(`Data complete: ${isDataComplete}`);
    console.log(`Total rows retrieved: ${allRows.length}`);
    
    if (failedSheets.length > 0) {
      console.log(`Failed sheets:`, failedSheets.map(f => f.title).join(', '));
    }

    if (
      allRows.length === 0 &&
      dateSheets.length > 0 &&
      targetTitles.length === 0
    ) {
      const fallbackTitles = dateSheets
        .slice()
        .sort((a, b) => b.date - a.date)
        .slice(0, Math.max(1, parseInt(dateRangeParam, 10) || 7))
        .map((s) => s.sheet.title);

      for (const title of fallbackTitles) {
        const sheet = doc.sheetsByTitle[title];
        try {
          const rows = await sheet.getRows();
          allRows.push(...rows);
          processedSheets.push({ title, rowCount: rows.length });
        } catch (err) {
          if (
            err &&
            typeof err.message === "string" &&
            err.message.includes("No values in the header row")
          ) {
            console.warn(
              `Skipping fallback sheet ${title}: missing header row (first row has no values).`
            );
          } else {
            console.error(`Error loading fallback sheet ${title}:`, err);
          }
        }
      }
    }

    const rowsWithDates = allRows.map((r) => {
      const rawTs =
        r.get("Timestamp") ||
        r.get("Registration Date") ||
        r.get("Registration") ||
        "";
      return { row: r, dateIso: formatTimestamp(rawTs) };
    });

    rowsWithDates.sort((a, b) => {
      const da = a.dateIso ? new Date(a.dateIso) : null;
      const db = b.dateIso ? new Date(b.dateIso) : null;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });

    const seen = new Set();
    const uniqueRows = [];
    for (const item of rowsWithDates) {
      const r = item.row;
      const phone = ((r.get("Phone") || r.get("Phone Number") || "") + "")
        .toString()
        .trim();
      if (!phone) continue;
      if (!seen.has(phone)) {
        uniqueRows.push({ row: r, timestampIso: item.dateIso });
        seen.add(phone);
      }
    }

    // build contacts with ALL columns including demoRequested variants
    const contactsAll = uniqueRows.map((it) => {
      const r = it.row;
      return {
        timestamp:
          it.timestampIso ||
          formatTimestamp(
            r.get("Timestamp") || r.get("Registration Date") || ""
          ) ||
          "",
        name: r.get("Name") || r.get("Full Name") || "",
        phone: r.get("Phone") || r.get("Phone Number") || "",
        email: r.get("Email") || "",
        city: r.get("City") || "",
        language: r.get("Language") || "",
        board: r.get("Board") || "",
        grade: r.get("Grade") || "",
        registrationDate: r.get("Registration Date") || "",
        formSubmitted:
          r.get("Form Submitted") ||
          r.get("Form Submited") ||
          r.get("Form Submittet") ||
          "",
        status: r.get("Status") || "",
        leadSource: r.get("Source") || r.get("Lead Source") || "",
        currentStatus: r.get("Current Status") || "",
        demoDate:
          r.get("Demo Date") || r.get("Demo_Date") || r.get("DemoDate") || "",
        // IMPORTANT: include demoRequested field with many header variants
        demoRequested:
          r.get("Demo Requested") ||
          r.get("Demo requested") ||
          r.get("Demo Request") ||
          r.get("DemoRequested") ||
          r.get("Demo Request?") ||
          r.get("Demo Request (Yes/No)") ||
          r.get("demo_requested") ||
          r.get("demoRequest") ||
          "",
        // demoStatus with variants
        demoStatus:
          r.get("Demo Status") ||
          r.get("DemoStatus") ||
          r.get("Demo Status (Yes/No)") ||
          r.get("Demo_Status") ||
          "",
        followUpDay1:
          r.get("Follow-up day-1") ||
          r.get("Follow up day-1") ||
          r.get("Follow-up day 1") ||
          "",
        nextAction: r.get("Next Action") || "",
        salesOwner: r.get("Sales Owner") || "",
        feedbackFromCustomer:
          r.get("Feedback from Customer") ||
          r.get("Feedback From Customer") ||
          "",
        assignedTo: r.get("Assigned To") || "",
        assignedPhone: r.get("Assigned Phone") || "",
        assignedAt: r.get("Assigned At") || "",
      };
    });

    const contacts = fields
      ? contactsAll.map((c) => {
          const obj = {};
          for (const f of fields) if (f in c) obj[f] = c[f];
          return obj;
        })
      : contactsAll;

    const stats = processSheetRows(uniqueRows.map((it) => it.row));

    const availableSheetNames = dateSheets
      .slice()
      .sort((a, b) => b.date - a.date)
      .map((s) => s.sheet.title);

    const response = {
      ...stats,
      contacts,
      dateRange: {
        requested: (() => {
          if (specificDate) return [specificDate];
          if (monthYearParam) return [`monthYear:${monthYearParam}`];
          if (monthParam && yearParam)
            return [`month:${monthParam}-${yearParam}`];
          return targetTitles;
        })(),
        processed: processedSheets,
        available: availableSheetNames,
      },
      metadata: {
        totalSheetsProcessed: processedSheets.length,
        totalRowsProcessed: allRows.length,
        uniqueContacts: uniqueRows.length,
        filteredContacts: contacts.length,
        dateRange: specificDate
          ? `Specific date: ${specificDate}`
          : monthYearParam
          ? `Month: ${monthYearParam}`
          : monthParam && yearParam
          ? `Month: ${monthParam}-${yearParam}`
          : `Last ${dateRangeParam} sheets/days`,
      },
      // Data validation and completeness info
      isComplete: isDataComplete,
      expectedSheets: expectedSheets,
      processedSheetsCount: processedSheets.length,
      failedSheetsCount: failedSheets.length,
      completionPercentage: completionPercentage,
      hasErrors: hasErrors,
      failedSheets: failedSheets,
      totalRows: allRows.length,
      debug: debug
        ? {
            triedTargetTitles: targetTitles,
            processedSheets,
            availableSheetNames,
            failedSheets,
            processingSummary: {
              expectedSheets,
              processedSheets: processedSheets.length,
              failedSheets: failedSheets.length,
              completionPercentage,
              isDataComplete,
              hasErrors
            }
          }
        : undefined,
    };

    // Only cache if data is complete
    if (cacheTtl > 0 && isDataComplete) {
      setCache(cacheKey, response, cacheTtl);
      console.log(`✓ Cached complete data: ${allRows.length} rows from ${processedSheets.length} sheets`);
    } else if (hasErrors) {
      console.log(`⚠ Not caching incomplete data: ${processedSheets.length}/${expectedSheets} sheets processed (${completionPercentage}%)`);
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in freesignupsheet API:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
