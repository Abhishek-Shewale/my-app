// app/api/conversionsheet/route.js
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

// Helper to process conversion sheet data with analytics
const processConversionData = (rows) => {
  if (!rows || rows.length === 0) {
    return {
      title: "Conversion Analytics",
      data: [],
      summary: [
        { label: "Total Records", value: 0 },
        { label: "Activated", value: 0 },
        { label: "Pending Activation", value: 0 },
        { label: "With Ratings", value: 0 },
        { label: "Unique Months", value: 0 },
      ],
      rawStats: {
        totalRecords: 0,
        activated: 0,
        pendingActivation: 0,
        withRatings: 0,
        monthlyBreakdown: {},
        activationRate: 0,
        ratingsRate: 0,
      },
    };
  }

  const totalRecords = rows.length;

  // Count activated (assuming "Yes" or similar values indicate activation)
  const activated = rows.filter((row) => {
    const activationStatus = (row.get("Activated") || "")
      .toString()
      .toLowerCase();
    return (
      activationStatus === "yes" ||
      activationStatus === "true" ||
      activationStatus === "activated"
    );
  }).length;

  const pendingActivation = totalRecords - activated;

  // Count records with ratings
  const withRatings = rows.filter((row) => {
    const rating = row.get("Ratings in Amazon") || "";
    return rating && rating.toString().trim() !== "";
  }).length;

  // Monthly breakdown
  const monthlyBreakdown = {};
  rows.forEach((row) => {
    const month = row.get("Purchase Month") || "Unknown";
    const monthKey = month.toString().trim() || "Unknown";
    monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
  });

  const activationRate =
    totalRecords > 0 ? ((activated / totalRecords) * 100).toFixed(1) : 0;
  const ratingsRate =
    totalRecords > 0 ? ((withRatings / totalRecords) * 100).toFixed(1) : 0;

  return {
    title: "Conversion Analytics",
    data: [
      {
        name: "Activated",
        value: activated,
        percentage: Math.round((activated / totalRecords) * 100),
      },
      {
        name: "Pending",
        value: pendingActivation,
        percentage: Math.round((pendingActivation / totalRecords) * 100),
      },
    ],
    summary: [
      { label: "Total Records", value: totalRecords },
      { label: "Activated", value: activated },
      { label: "Pending Activation", value: pendingActivation },
      { label: "With Ratings", value: withRatings },
      { label: "Unique Months", value: Object.keys(monthlyBreakdown).length },
    ],
    rawStats: {
      totalRecords,
      activated,
      pendingActivation,
      withRatings,
      monthlyBreakdown,
      activationRate: parseFloat(activationRate),
      ratingsRate: parseFloat(ratingsRate),
    },
  };
};

/* -------------------- API Route -------------------- */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId = searchParams.get("spreadsheetId");
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

    // Process the data to get analytics
    const analytics = processConversionData(rows);

    // Extract detailed contact data
    const data = rows.map((row) => ({
      name: row.get("Name") || "",
      email: row.get("Email ID") || row.get("Email") || "",
      contact:
        row.get("Contact") || row.get("Phone") || row.get("Phone Number") || "",
      purchaseMonth: row.get("Purchase Month") || "",
      activated: row.get("Activated") || "",
      ratingsInAmazon: row.get("Ratings in Amazon") || "",
      lastFollowUp:
        row.get("Last Follow-Up") || row.get("Last Follow Up") || "",
    }));

    // Filter out empty rows (rows with no name and no contact)
    const filteredData = data.filter(
      (item) => item.name.trim() !== "" || item.contact.trim() !== ""
    );

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
          }
        : undefined,
    });
  } catch (error) {
    console.error("Error in conversionsheet API:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
