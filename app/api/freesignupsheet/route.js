// app/api/freesignupsheet/route.js
import { NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

/* -------------------- Helpers -------------------- */

function getServiceAccount() {
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let private_key = process.env.GOOGLE_PRIVATE_KEY;

  if (!client_email || !private_key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY"
    );
  }
  // replace escaped newlines (common in env files)
  private_key = private_key.replace(/\\n/g, "\n");
  return { client_email, private_key };
}

/**
 * parseSheetDate
 * Accepts sheet titles like "01-08-2025" or "1-8-2025" and returns a Date or null
 */
const parseSheetDate = (sheetName) => {
  try {
    const parts = sheetName.trim().split("-");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      const dt = new Date(`${year}-${month}-${day}`);
      if (!isNaN(dt.getTime())) return dt;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * formatTimestamp
 * Try to parse different timestamp formats and return ISO string or null (if unparseable)
 */
const formatTimestamp = (ts) => {
  if (!ts) return null;
  try {
    // Try direct JS parse first
    let d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();

    // Try dd-mm-yyyy [HH:mm[:ss]] formats
    const parts = ts.toString().trim().split(" ");
    const datePart = parts[0];
    const timePart = parts.slice(1).join(" ") || "00:00:00";
    const dparts = datePart.split("-");
    if (dparts.length === 3) {
      const day = dparts[0].padStart(2, "0");
      const month = dparts[1].padStart(2, "0");
      const year = dparts[2];
      // ensure time is in hh:mm:ss (if only hh:mm provided, append :00)
      const normTime =
        timePart.split(":").length === 2 ? `${timePart}:00` : timePart;
      d = new Date(`${year}-${month}-${day}T${normTime}`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    // unparseable
    return null;
  } catch {
    return null;
  }
};

// Generic aggregator helper for stats
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
  const demoStatus = countBy(rows, (r) => r.get("Demo Status"));
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
    const specificDate = searchParams.get("date"); // DD-MM-YYYY
    const monthParam = searchParams.get("month"); // numeric month (1-12)
    const yearParam = searchParams.get("year"); // numeric year
    const monthYearParam = searchParams.get("monthYear"); // "MM-YYYY" or "M-YYYY"
    const debug = searchParams.get("debug") === "1";

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    // Acquire service account credentials
    const { client_email, private_key } = getServiceAccount();

    // Create doc and authenticate
    let doc = new GoogleSpreadsheet(spreadsheetId);
    try {
      // prefer useServiceAccountAuth if available
      if (typeof doc.useServiceAccountAuth === "function") {
        await doc.useServiceAccountAuth({ client_email, private_key });
      } else {
        // fallback to JWT + oauth attachment (older/newer lib variants)
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
          // last fallback: recreate with auth object in constructor (some versions accept second arg)
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

    // collect sheets that look like dates
    const allSheets = Object.values(doc.sheetsByTitle || {});
    const dateSheets = allSheets
      .map((s) => ({ sheet: s, date: parseSheetDate(s.title) }))
      .filter((x) => x.date !== null);

    // decide which sheet titles to process
    let targetTitles = [];

    if (specificDate) {
      targetTitles = [specificDate];
    } else if (monthYearParam) {
      // monthYearParam like "09-2025" or "9-2025"
      const parts = monthYearParam.split("-");
      const mon = parseInt(parts[0], 10);
      const yr = parseInt(parts[1], 10);
      if (!isNaN(mon) && mon >= 1 && mon <= 12 && !isNaN(yr)) {
        targetTitles = dateSheets
          .filter(
            (s) => s.date.getMonth() + 1 === mon && s.date.getFullYear() === yr
          )
          .map((s) => s.sheet.title)
          .sort((a, b) => parseSheetDate(b) - parseSheetDate(a));
      } else {
        return NextResponse.json(
          { error: "Invalid monthYear parameter (expected MM-YYYY)" },
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

    // load rows from target sheets
    let allRows = [];
    const processedSheets = [];
    for (const title of targetTitles) {
      const sheet = doc.sheetsByTitle[title];
      if (!sheet) continue;
      try {
        const rows = await sheet.getRows();
        allRows.push(...rows);
        processedSheets.push({ title, rowCount: rows.length });
      } catch (err) {
        console.error(`Error loading sheet ${title}:`, err);
      }
    }

    // fallback: if nothing matched and dateSheets exist, take most recent N
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
          console.error(`Error loading fallback sheet ${title}:`, err);
        }
      }
    }

    // sort by timestamp and dedupe by phone (keep latest)
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

    // build contacts with ALL columns including the new ones
    const contacts = uniqueRows.map((it) => {
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
        demoDate: r.get("Demo Date") || "",
        demoStatus: r.get("Demo Status") || "",
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

    // compute stats from uniqueRows (pass raw row objects)
    const stats = processSheetRows(uniqueRows.map((it) => it.row));

    const availableSheetNames = dateSheets
      .slice()
      .sort((a, b) => b.date - a.date)
      .map((s) => s.sheet.title);

    return NextResponse.json({
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
      debug: debug
        ? {
            triedTargetTitles: targetTitles,
            processedSheets,
            availableSheetNames,
          }
        : undefined,
    });
  } catch (error) {
    console.error("Error in freesignupsheet API:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
