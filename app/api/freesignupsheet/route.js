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
      if (!isNaN(dt.getTime())) return dt;
    }
    return null;
  } catch {
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
      parseInt(searchParams.get("sheetDelayMs") || "400", 10)
    );
    const maxRetries = Math.max(
      0,
      parseInt(searchParams.get("maxRetries") || "4", 10)
    );
    const initialDelayMs = Math.max(
      100,
      parseInt(searchParams.get("initialDelayMs") || "500", 10)
    );
    const jitterMs = Math.max(
      0,
      parseInt(searchParams.get("jitterMs") || "300", 10)
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
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);

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

    let targetTitles = [];

    if (specificDate) {
      targetTitles = [specificDate];
    } else if (monthYearParam) {
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

    let allRows = [];
    const processedSheets = [];
    for (const title of targetTitles) {
      const sheet = doc.sheetsByTitle[title];
      if (!sheet) continue;
      try {
        const rows = await getRowsWithRetry(sheet);
        allRows.push(...rows);
        processedSheets.push({ title, rowCount: rows.length });
      } catch (err) {
        if (
          err &&
          typeof err.message === "string" &&
          err.message.includes("No values in the header row")
        ) {
          console.warn(
            `Skipping sheet ${title}: missing header row (first row has no values).`
          );
        } else {
          console.error(`Error loading sheet ${title}:`, err);
        }
      }
      const jitter = Math.floor(
        Math.random() * Math.max(1, Math.floor(jitterMs / 2))
      );
      await new Promise((r) => setTimeout(r, sheetDelayMs + jitter));
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
      debug: debug
        ? {
            triedTargetTitles: targetTitles,
            processedSheets,
            availableSheetNames,
          }
        : undefined,
    };

    if (cacheTtl > 0) setCache(cacheKey, response, cacheTtl);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in freesignupsheet API:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
