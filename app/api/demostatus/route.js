// app/api/demostatus/route.js
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

// Normalize phone numbers to digits only and compare by last 10 digits
const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = raw.toString().replace(/\D+/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits; // return as-is if fewer than 10 digits
};

// Helper to process demo status data
const processDemoStatusData = (rows) => {
  if (!rows || rows.length === 0) {
    return {
      title: "Demo Status Analytics",
      data: [],
      summary: [
        { label: "Total Demo Records", value: 0 },
        { label: "Demos Completed", value: 0 },
        { label: "Demos Pending", value: 0 },
        { label: "Completion Rate", value: "0%" },
      ],
      rawStats: {
        totalDemoRecords: 0,
        demosCompleted: 0,
        demosPending: 0,
        completionRate: 0,
        phoneNumberMapping: {},
      },
    };
  }

  const phoneNumberMapping = {};
  const nameMapping = {};

  // Normalize name: trim, lowercase, collapse multiple spaces
  const normalizeName = (raw) => {
    if (!raw) return "";
    return raw.toString().toLowerCase().trim().replace(/\s+/g, " ");
  };

  // Create phone number mapping for demo status
  rows.forEach((row) => {
    const phoneNumberRaw =
      row.get("Phone Number") || row.get("Phone") || row.get("Contact") || "";
    // USE RAW PHONE (trim only), per user request
    const phoneNumber = (phoneNumberRaw || "").toString().trim();

    // Column J as per user: ONLY use 'Demo Completed'
    const completedRaw = row.get("Demo Completed") || "";
    const demoStatus = completedRaw.toString().toLowerCase().trim();

    const nameRaw = row.get("Name") || "";
    const nameKey = normalizeName(nameRaw);

    // Store phone number mapping - only store if phone number exists
    if (phoneNumber) {
      phoneNumberMapping[phoneNumber] = {
        demoStatus: demoStatus,
        // Completed strictly when 'Demo Completed' equals 'yes' (case-insensitive)
        isCompleted: demoStatus === "yes",
      };
    }

    // Store name mapping - only store if name exists
    if (nameKey) {
      nameMapping[nameKey] = {
        demoStatus: demoStatus,
        isCompleted: demoStatus === "yes",
      };
    }
  });

  // Note: We don't calculate totals here because we need to match with main sheet first
  // The actual calculations will be done in the dashboard when matching phone numbers

  return {
    title: "Demo Status Analytics - Phone Mapping Only",
    data: [],
    summary: [
      { label: "Total Demo Records in Sheet", value: rows.length },
      {
        label: "Records with Names",
        value: Object.keys(nameMapping).length,
      },
      {
        label: "Note",
        value: "Phone keys use RAW values (trim-only)",
      },
    ],
    rawStats: {
      totalDemoRecords: rows.length, // Total records in demo sheet
      totalWithPhoneNumbers: Object.keys(phoneNumberMapping).length,
      totalWithNames: Object.keys(nameMapping).length,
      phoneNumberMapping, // Keys are raw phones (trim-only)
      nameMapping, // Keys are normalized names (lowercased, trimmed)
    },
  };
};

/* -------------------- API Route -------------------- */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId =
      searchParams.get("spreadsheetId") ||
      "1vbMaoxQ-4unVZ7OIgizwHl3hl6bxRlwEhN-m94iLr8k";
    const debug = searchParams.get("debug") === "1";

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

    // Helper with retry/backoff for quota errors
    const getRowsWithRetry = async (
      sheet,
      maxRetries = 5,
      initialDelayMs = 1000
    ) => {
      let attempt = 0;
      let delayMs = initialDelayMs;
      while (true) {
        try {
          return await sheet.getRows();
        } catch (err) {
          const is429 =
            (err && err.status === 429) ||
            (typeof err.message === "string" && err.message.includes("429"));
          if (is429 && attempt < maxRetries) {
            console.log(
              `Rate limit hit, retrying in ${delayMs}ms (attempt ${
                attempt + 1
              }/${maxRetries})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            attempt += 1;
            delayMs = Math.min(delayMs * 2, 15000); // exponential backoff with max limit
            continue;
          }
          throw err;
        }
      }
    };

    // Get the first sheet (or you can specify a particular sheet name)
    let targetSheet;
    const sheetName = searchParams.get("sheetName"); // optional parameter to specify sheet name

    if (sheetName && doc.sheetsByTitle[sheetName]) {
      targetSheet = doc.sheetsByTitle[sheetName];
    } else {
      // Get first sheet if no specific sheet name provided
      targetSheet = doc.sheetsByIndex[0];
    }

    if (!targetSheet) {
      return NextResponse.json(
        { error: "No sheets found in the spreadsheet" },
        { status: 404 }
      );
    }

    // Load rows with retry logic
    let rows = [];
    try {
      rows = await getRowsWithRetry(targetSheet);
    } catch (err) {
      if (
        err &&
        typeof err.message === "string" &&
        err.message.includes("No values in the header row")
      ) {
        console.warn(
          `Skipping sheet ${targetSheet.title}: missing header row (first row has no values).`
        );
        return NextResponse.json(
          { error: "Sheet has no header row or is empty" },
          { status: 400 }
        );
      } else {
        console.error(`Error loading sheet ${targetSheet.title}:`, err);
        throw err;
      }
    }

    // Process the data to get demo status analytics
    const analytics = processDemoStatusData(rows);

    // Extract detailed demo status data using RAW phone (include name)
    const data = rows.map((row) => ({
      phoneNumber: (
        row.get("Phone Number") ||
        row.get("Phone") ||
        row.get("Contact") ||
        ""
      )
        .toString()
        .trim(),
      name: (row.get("Name") || "").toString().trim(),
      nameKey: (row.get("Name") || "")
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " "),
      demoStatus: (row.get("Demo Completed") || "").toString().trim(),
    }));

    // Filter out empty rows (rows with no phone number)
    const filteredData = data.filter((item) => item.phoneNumber !== "");

    return NextResponse.json({
      ...analytics,
      sheetTitle: targetSheet.title,
      data: filteredData,
      metadata: {
        totalRowsProcessed: rows.length,
        filteredRecords: filteredData.length,
        sheetName: targetSheet.title,
        spreadsheetTitle: doc.title,
      },
      debug: debug
        ? {
            availableSheets: Object.keys(doc.sheetsByTitle),
            processedSheet: targetSheet.title,
            rawRowCount: rows.length,
            sampleData: filteredData.slice(0, 3), // Show first 3 records for debugging
          }
        : undefined,
    });
  } catch (error) {
    console.error("Error in demostatus API:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
