import { NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { getCache, setCache, makeCacheKey } from "../../../lib/serverCache";

// Initialize Google Sheets handler
const initializeGoogleSheets = async (spreadsheetId) => {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  try {
    const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    await doc.loadInfo();
    return doc;
  } catch (error) {
    console.error("Error initializing Google Sheets:", error);
    throw new Error("Failed to connect to Google Sheets: " + error.message);
  }
};

// Process sheet data to generate statistics
const processSheetData = (rows) => {
  if (!rows || rows.length === 0) {
    return {
      title: "WhatsApp Bot Analytics",
      data: [{ name: "No Data", value: 1, percentage: 100 }],
      summary: [
        { label: "Total Contacts", value: 0 },
        { label: "Demo Requests", value: 0 },
        { label: "English Users", value: 0 },
        { label: "Hindi Users", value: 0 },
        { label: "Other Languages", value: 0 },
      ],
      rawStats: {
        totalContacts: 0,
        demoRequested: 0,
        languages: { english: 0, hindi: 0, other: 0 },
        status: { new: 0, contacted: 0, converted: 0 },
      },
    };
  }

  const stats = {
    totalContacts: rows.length,
    demoRequested: rows.filter((row) => row.get("Demo Requested") === "Yes")
      .length,
    languages: {
      english: rows.filter((row) => row.get("Language") === "English").length,
      hindi: rows.filter((row) => row.get("Language") === "Hindi").length,
      other: rows.filter(
        (row) => !["English", "Hindi"].includes(row.get("Language"))
      ).length,
    },
    status: {
      new: rows.filter((row) => row.get("Status") === "New Lead").length,
      contacted: rows.filter((row) => row.get("Status") === "Contacted").length,
      converted: rows.filter((row) => row.get("Status") === "Converted").length,
    },
  };

  // Prepare data for donut chart
  const chartData = [
    {
      name: "Demo Requested",
      value: stats.demoRequested,
      percentage: Math.round((stats.demoRequested / stats.totalContacts) * 100),
    },
    {
      name: "No Demo",
      value: stats.totalContacts - stats.demoRequested,
      percentage: Math.round(
        ((stats.totalContacts - stats.demoRequested) / stats.totalContacts) *
          100
      ),
    },
  ];

  // Prepare summary data
  const summary = [
    { label: "Total Contacts", value: stats.totalContacts },
    { label: "Demo Requests", value: stats.demoRequested },
    { label: "English Users", value: stats.languages.english },
    { label: "Hindi Users", value: stats.languages.hindi },
    { label: "Other Languages", value: stats.languages.other },
  ];

  return {
    title: "WhatsApp Bot Analytics",
    data: chartData,
    summary: summary,
    rawStats: stats,
  };
};

// Helper function to get date range
const getDateRange = (days = 7) => {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const formattedDate = date
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "-");
    dates.push(formattedDate);
  }
  return dates;
};

// Helper function to parse date from sheet name
const parseSheetDate = (sheetName) => {
  try {
    // Handle both DD-MM-YYYY and D-M-YYYY formats
    const parts = sheetName.split("-");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      return new Date(`${year}-${month}-${day}`);
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Helper function to format timestamp
const formatTimestamp = (timestampStr) => {
  if (!timestampStr) return null;

  try {
    // Handle different timestamp formats
    let date;

    // Check if it's already a valid date string
    if (timestampStr.includes("T") || timestampStr.includes("/")) {
      date = new Date(timestampStr);
    } else {
      // Try parsing as DD-MM-YYYY HH:MM format
      const parts = timestampStr.split(" ");
      if (parts.length >= 2) {
        const datePart = parts[0];
        const timePart = parts[1];

        const dateParts = datePart.split("-");
        if (dateParts.length === 3) {
          const day = dateParts[0].padStart(2, "0");
          const month = dateParts[1].padStart(2, "0");
          const year = dateParts[2];

          date = new Date(`${year}-${month}-${day}T${timePart}`);
        }
      }

      // If still no valid date, try direct parsing
      if (!date || isNaN(date.getTime())) {
        date = new Date(timestampStr);
      }
    }

    // Return ISO string if valid, otherwise return original
    return date && !isNaN(date.getTime()) ? date.toISOString() : timestampStr;
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return timestampStr;
  }
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId = searchParams.get("spreadsheetId");
    const specificDate = searchParams.get("date"); // Optional specific date
    const monthParam = searchParams.get("month"); // e.g. "2025-09" (YYYY-MM format)
    const dateRange = searchParams.get("dateRange") || "7"; // fallback to days if no month
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
        { error: "Spreadsheet ID is required" },
        { status: 400 }
      );
    }

    // Cache key includes inputs that affect the response shape
    const cacheKey = makeCacheKey([
      "mastersheet",
      spreadsheetId,
      specificDate || "",
      monthParam || "",
      String(dateRange),
      fields ? fields.sort().join(",") : "__all__",
    ]);
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Initialize Google Sheets
    const doc = await initializeGoogleSheets(spreadsheetId);

    // Get all available sheets FIRST to avoid unnecessary API calls
    const availableSheets = Object.values(doc.sheetsByTitle);
    const dateSheets = availableSheets.filter((sheet) => {
      const date = parseSheetDate(sheet.title);
      return date !== null;
    });

    // Sort sheets by date (newest first)
    dateSheets.sort((a, b) => {
      const dateA = parseSheetDate(a.title);
      const dateB = parseSheetDate(b.title);
      return dateB - dateA;
    });

    let targetDates = [];
    let sheetsToProcess = [];

    if (specificDate) {
      // Only process if sheet exists
      const sheet = doc.sheetsByTitle[specificDate];
      if (sheet) {
        sheetsToProcess = [sheet];
      }
    } else if (monthParam) {
      // Filter existing sheets by month instead of generating all possible dates
      const [year, month] = monthParam.split("-");
      sheetsToProcess = dateSheets.filter((sheet) => {
        const sheetDate = parseSheetDate(sheet.title);
        if (!sheetDate) return false;

        return (
          sheetDate.getFullYear() === parseInt(year) &&
          sheetDate.getMonth() === parseInt(month) - 1
        ); // Month is 0-indexed
      });
    } else {
      // Use most recent available sheets up to dateRange limit
      const limit = parseInt(dateRange);
      sheetsToProcess = dateSheets.slice(0, Math.min(limit, dateSheets.length));
    }

    let allRows = [];
    let processedSheets = [];
    let skippedSheets = [];

    // Process only existing sheets
    for (const sheet of sheetsToProcess) {
      try {
        // Robust retry with backoff + jitter
        let attempt = 0;
        let delayMs = initialDelayMs;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const getRowsWithRetry = async () => {
          for (;;) {
            try {
              return await sheet.getRows();
            } catch (error) {
              const msg =
                typeof error?.message === "string" ? error.message : "";
              const is429 =
                error?.status === 429 ||
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
              throw error;
            }
          }
        };
        const rows = await getRowsWithRetry();

        // Check if sheet has valid data (non-empty rows with required columns)
        if (rows && rows.length > 0) {
          allRows.push(...rows);
          processedSheets.push({
            date: sheet.title,
            rowCount: rows.length,
          });
        } else {
          skippedSheets.push({
            date: sheet.title,
            reason: "No data rows found",
          });
        }
      } catch (error) {
        // Handle specific header row error
        if (
          error &&
          typeof error.message === "string" &&
          error.message.includes("No values in the header row")
        ) {
          console.warn(
            `Skipping sheet ${sheet.title}: missing header row (first row has no values).`
          );
          skippedSheets.push({
            date: sheet.title,
            reason: "Missing header row",
          });
        } else {
          console.error(`Error loading sheet ${sheet.title}:`, error);
          skippedSheets.push({
            date: sheet.title,
            reason: `Error: ${error.message}`,
          });
        }
      }
      // Respect per-sheet delay to avoid bursts
      const jitter = Math.floor(
        Math.random() * Math.max(1, Math.floor(jitterMs / 2))
      );
      await new Promise((r) => setTimeout(r, sheetDelayMs + jitter));
    }

    // Sort all rows by Timestamp descending
    const sortedRows = [...allRows].sort((a, b) => {
      const timestampA = formatTimestamp(a.get("Timestamp"));
      const timestampB = formatTimestamp(b.get("Timestamp"));

      const dateA = new Date(timestampA);
      const dateB = new Date(timestampB);

      // Handle invalid dates
      if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;

      return dateB - dateA;
    });

    // Deduplicate by phone number, keeping only the latest
    const seenNumbers = new Set();
    const uniqueRows = [];
    for (const row of sortedRows) {
      const number = row.get("Phone Number");
      if (number && !seenNumbers.has(number)) {
        uniqueRows.push(row);
        seenNumbers.add(number);
      }
    }

    // Process data
    const stats = processSheetData(uniqueRows);

    // Extract contacts with all required fields and properly formatted timestamps
    const contactsAll = uniqueRows
      .filter((row) => row.get("Phone Number") && row.get("Name"))
      .map((row) => ({
        number: row.get("Phone Number"),
        name: row.get("Name"),
        email: row.get("Email") || "",
        timestamp: formatTimestamp(row.get("Timestamp")),
        language: row.get("Language") || "Not Selected",
        demoRequested: row.get("Demo Requested") || "No",
      }));

    const contacts = fields
      ? contactsAll.map((c) => {
          const obj = {};
          for (const f of fields) if (f in c) obj[f] = c[f];
          return obj;
        })
      : contactsAll;

    // Get available sheet names for frontend
    const availableSheetNames = dateSheets
      .map((sheet) => sheet.title)
      .sort((a, b) => {
        const dateA = parseSheetDate(a);
        const dateB = parseSheetDate(b);
        return dateB - dateA;
      });

    // Return comprehensive data
    const response = {
      ...stats,
      contacts,
      dateRange: {
        requested: monthParam
          ? `Month: ${monthParam}`
          : specificDate
          ? `Date: ${specificDate}`
          : `Last ${dateRange} days`,
        processed: processedSheets,
        skipped: skippedSheets,
        available: availableSheetNames,
      },
      metadata: {
        totalSheetsAvailable: dateSheets.length,
        totalSheetsProcessed: processedSheets.length,
        totalSheetsSkipped: skippedSheets.length,
        totalRowsProcessed: allRows.length,
        uniqueContacts: uniqueRows.length,
        filteredContacts: contacts.length,
        dateRange: specificDate
          ? `Specific date: ${specificDate}`
          : monthParam
          ? `Month: ${monthParam}`
          : `Last ${dateRange} days`,
      },
    };

    // Save to cache
    if (cacheTtl > 0) setCache(cacheKey, response, cacheTtl);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching WhatsApp stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch WhatsApp statistics" },
      { status: 500 }
    );
  }
}
