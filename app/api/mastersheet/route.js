import { NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

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

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Spreadsheet ID is required" },
        { status: 400 }
      );
    }

    // Initialize Google Sheets
    const doc = await initializeGoogleSheets(spreadsheetId);

    let targetDates = [];

    if (specificDate) {
      targetDates = [specificDate];
    } else if (monthParam) {
      // Generate all dates of the given month (YYYY-MM format)
      const [year, month] = monthParam.split("-");
      const daysInMonth = new Date(year, month, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const day = String(d).padStart(2, "0");
        const formattedDate = `${day}-${month.padStart(2, "0")}-${year}`;
        targetDates.push(formattedDate);
      }
    } else {
      targetDates = getDateRange(parseInt(dateRange));
    }

    // Get all available sheets and filter by date pattern
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

    let allRows = [];
    let processedSheets = [];

    // Process sheets based on target dates or available sheets
    for (const targetDate of targetDates) {
      const sheet = doc.sheetsByTitle[targetDate];
      if (sheet) {
        try {
          const rows = await sheet.getRows();
          allRows.push(...rows);
          processedSheets.push({
            date: targetDate,
            rowCount: rows.length,
          });
        } catch (error) {
          console.error(`Error loading sheet ${targetDate}:`, error);
        }
      }
    }

    // If no sheets found for target dates, use the most recent available sheets
    if (allRows.length === 0 && dateSheets.length > 0) {
      const sheetsToProcess = dateSheets.slice(
        0,
        Math.min(parseInt(dateRange), dateSheets.length)
      );

      for (const sheet of sheetsToProcess) {
        try {
          const rows = await sheet.getRows();
          allRows.push(...rows);
          processedSheets.push({
            date: sheet.title,
            rowCount: rows.length,
          });
        } catch (error) {
          console.error(`Error loading sheet ${sheet.title}:`, error);
        }
      }
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
    const contacts = uniqueRows
      .filter((row) => row.get("Phone Number") && row.get("Name")) // Only include contacts with both phone and name
      .map((row) => ({
        number: row.get("Phone Number"),
        name: row.get("Name"),
        email: row.get("Email") || "", // Include email field
        timestamp: formatTimestamp(row.get("Timestamp")),
        language: row.get("Language") || "Not Selected",
        demoRequested: row.get("Demo Requested") || "No",
      }));

    // Get available sheet names for frontend
    const availableSheetNames = dateSheets
      .map((sheet) => sheet.title)
      .sort((a, b) => {
        const dateA = parseSheetDate(a);
        const dateB = parseSheetDate(b);
        return dateB - dateA;
      });

    // Return comprehensive data
    return NextResponse.json({
      ...stats,
      contacts,
      dateRange: {
        requested: targetDates,
        processed: processedSheets,
        available: availableSheetNames,
      },
      metadata: {
        totalSheetsProcessed: processedSheets.length,
        totalRowsProcessed: allRows.length,
        uniqueContacts: uniqueRows.length,
        filteredContacts: contacts.length, // Only contacts with both name and number
        dateRange: specificDate
          ? `Specific date: ${specificDate}`
          : `Last ${dateRange} days`,
      },
    });
  } catch (error) {
    console.error("Error fetching WhatsApp stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch WhatsApp statistics" },
      { status: 500 }
    );
  }
}
