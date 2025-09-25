"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import debounce from "lodash.debounce";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";

export default function WhatsAppDashboard({
  fallbackSpreadsheetId,
  hideNavButtons,
  month: controlledMonth,
  onChangeMonth,
}) {
  const router = useRouter();
  const [month, setMonth] = useState(controlledMonth || "2025-09");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [demoStatusData, setDemoStatusData] = useState(null);
  const [error, setError] = useState(null);
  const [navigating, setNavigating] = useState(false);

  // Function to determine which spreadsheet ID to use based on month
  const getSpreadsheetId = (selectedMonth) => {
    const monthYear = selectedMonth.split("-");
    const year = parseInt(monthYear[0]);
    const monthNum = parseInt(monthYear[1]);

    if (year === 2025 && monthNum >= 6 && monthNum <= 8) {
      return "1kB5DB06cDJNOyaN62VKJ-OAAO49C6W3UYuRMothn2Lg";
    }

    if (year === 2025 && monthNum >= 9) {
      return "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI";
    }

    return (
      fallbackSpreadsheetId || "1FsxidwIFtImv5JdVFZula6uFEKG9QKe9Q8Q8mOnuMdI"
    );
  };

  const months = ["2025-06", "2025-07", "2025-08", "2025-09"];

  // keep local month in sync if parent controls it
  useEffect(() => {
    if (controlledMonth && controlledMonth !== month) {
      setMonth(controlledMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledMonth]);

  // OPTIMIZED: Remove artificial delay and prefetch data
  const handleNavigateToFreeSignup = () => {
    setNavigating(true);

    // Prefetch the signup page data before navigation
    const signupSpreadsheetId = "1rWrkTM6Mh0bkwUpk1VsF3ReGkOk-piIoHDeCobSDHKY";
    prefetchSignupData(signupSpreadsheetId, month);

    // Navigate immediately without delay
    router.push("/Freesignup");
  };

  // OPTIMIZED: Prefetch function for signup data
  const prefetchSignupData = async (spreadsheetId, selectedMonth) => {
    try {
      const cacheKey = `signup-stats-${selectedMonth}`;
      const cached = localStorage.getItem(cacheKey);

      if (!cached) {
        const url = new URL("/api/freesignupsheet", window.location.origin);
        url.searchParams.set("spreadsheetId", spreadsheetId);
        url.searchParams.set(
          "monthYear",
          selectedMonth.split("-")[1] + "-" + selectedMonth.split("-")[0]
        );
        // Request only the fields needed by the signup page list view
        url.searchParams.set(
          "fields",
          [
            "timestamp",
            "name",
            "phone",
            "email",
            "language",
            "assignedTo",
          ].join(",")
        );

        // Fire and forget - don't wait for response
        fetch(url.toString())
          .then((res) => res.json())
          .then((data) => {
            const timestamp = new Date().getTime();
            localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
          })
          .catch(() => {
            // Ignore prefetch errors
          });
      }
    } catch (e) {
      // Ignore prefetch errors
    }
  };

  const languageColors = {
    English: "#a78bfa",
    Hindi: "#fb923c",
    Marathi: "#f472b6",
    Bengali: "#22d3ee",
    Gujarati: "#34d399",
    Telugu: "#fbbf24",
    Tamil: "#f87171",
    Kannada: "#a3e635",
    Malayalam: "#818cf8",
    Punjabi: "#d97706",
    Odia: "#14b8a6",
    Assamese: "#a855f7",
    Urdu: "#ef4444",
    Other: "#9ca3af",
  };

  // OPTIMIZED: Longer cache duration (15 minutes instead of 5)
  const getCachedData = (monthKey, spreadsheetId) => {
    try {
      const cacheKey = `whatsapp-stats-${monthKey}-${spreadsheetId}`;
      const cachedData = localStorage.getItem(cacheKey);
      if (!cachedData) return null;

      const { data, timestamp } = JSON.parse(cachedData);
      const now = new Date().getTime();
      const fifteenMinutesInMs = 15 * 60 * 1000; // Extended cache time

      if (now - timestamp < fifteenMinutesInMs) {
        return data;
      }
      return null;
    } catch (e) {
      console.error("Error accessing cached data:", e);
      return null;
    }
  };

  const cacheData = (monthKey, spreadsheetId, data) => {
    try {
      const timestamp = new Date().getTime();
      const cacheKey = `whatsapp-stats-${monthKey}-${spreadsheetId}`;
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp }));
    } catch (e) {
      console.error("Error caching data:", e);
    }
  };

  // OPTIMIZED: Fetch both main data and demo status data
  useEffect(() => {
    if (!month) return;

    const spreadsheetId = getSpreadsheetId(month);

    // Check cache first - if data exists, show immediately
    const cachedStats = getCachedData(month, spreadsheetId);
    const cachedDemoStatus = getCachedData(
      `demo-status-${month}`,
      "1vbMaoxQ-4unVZ7OIgizwHl3hl6bxRlwEhN-m94iLr8k"
    );

    if (cachedStats && cachedDemoStatus) {
      setStats(cachedStats);
      setDemoStatusData(cachedDemoStatus);
      setError(null);
      return;
    }

    // Only set loading if no cached data
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    // Fetch both APIs in parallel
    const fetchAllData = async () => {
      try {
        // Main spreadsheet data
        const mainUrl = new URL("/api/mastersheet", window.location.origin);
        mainUrl.searchParams.set("spreadsheetId", spreadsheetId);
        mainUrl.searchParams.set("month", month);
        mainUrl.searchParams.set(
          "fields",
          ["timestamp", "language", "demoRequested", "number", "name"].join(",")
        );

        // Demo status data
        const demoUrl = new URL("/api/demostatus", window.location.origin);
        demoUrl.searchParams.set(
          "spreadsheetId",
          "1vbMaoxQ-4unVZ7OIgizwHl3hl6bxRlwEhN-m94iLr8k"
        );

        const [mainRes, demoRes] = await Promise.all([
          fetch(mainUrl.toString(), {
            signal: controller.signal,
            timeout: 10000,
          }),
          fetch(demoUrl.toString(), {
            signal: controller.signal,
            timeout: 10000,
          }),
        ]);

        if (!mainRes.ok) throw new Error(`Main API error ${mainRes.status}`);

        const mainData = await mainRes.json();
        let demoData = null;

        if (demoRes.ok) {
          demoData = await demoRes.json();
          cacheData(
            `demo-status-${month}`,
            "1vbMaoxQ-4unVZ7OIgizwHl3hl6bxRlwEhN-m94iLr8k",
            demoData
          );
        } else {
          console.warn(
            "Demo status API failed, continuing without demo completion data"
          );
        }

        cacheData(month, spreadsheetId, mainData);
        setStats(mainData);
        setDemoStatusData(demoData);
        setError(null);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load");
          console.error("Fetch error:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
    return () => controller.abort();
  }, [month, fallbackSpreadsheetId]);

  // Debounced setter for month to reduce rapid refetches and UI churn
  const debouncedSetMonth = useMemo(
    () => debounce((val) => setMonth(val), 300),
    []
  );
  useEffect(() => {
    return () => debouncedSetMonth.cancel();
  }, [debouncedSetMonth]);

  // Process data from API response with demo completion data
  const processedData = useMemo(() => {
    if (!stats || !stats.contacts) return null;

    console.log("Raw stats from API:", stats); // Debug log
    console.log("Demo status data:", demoStatusData); // Debug log

    const totalContacts = stats.rawStats?.totalContacts ?? 0;
    const demoRequested = stats.rawStats?.demoRequested ?? 0;
    const demoNo = totalContacts - demoRequested;
    const conversionRate =
      totalContacts > 0 ? Math.round((demoRequested / totalContacts) * 100) : 0;

    // Process demo completion data - CORRECT LOGIC
    let demoCompleted = 0;
    let demoConversionRate = 0;
    let totalDemoRequestedContacts = 0;
    const phoneNumberMapping = demoStatusData?.rawStats?.phoneNumberMapping || {};

    // Use RAW phones (trim only), as per request
    const getRawPhone = (val) => {
      if (!val) return "";
      return val.toString().trim();
    };

    console.log("Phone mapping from demo sheet:", phoneNumberMapping);

    if (demoStatusData) {
      // Step 1: Create lookup map for demo-requested contacts from mastersheet by RAW phone
      const demoRequestedByPhone = new Map();
      const demoRequestedPhones = [];
      
      stats.contacts.forEach((contact) => {
        const dr =
          typeof contact.demoRequested === "string"
            ? contact.demoRequested.toLowerCase().trim()
            : contact.demoRequested;
        const isDemoRequested = dr === "yes" || dr === "y" || dr === true;
        
        if (isDemoRequested) {
          totalDemoRequestedContacts++;
          const phone = getRawPhone(contact.number || contact.phone || contact.phoneNumber || contact.contact || "");
          if (phone) {
            demoRequestedByPhone.set(phone, contact);
            demoRequestedPhones.push(phone);
          }
        }
      });

      console.log(
        "Demo requested contacts from main sheet:",
        totalDemoRequestedContacts
      );

      // Step 2: Match using phoneNumberMapping for O(1) checks
      const seenDemoKeys = new Set();
      const matchedContacts = [];

      demoRequestedPhones.forEach((phone) => {
        const mapped = phoneNumberMapping[phone];
        if (mapped && mapped.isCompleted) {
          if (!seenDemoKeys.has(phone)) {
            seenDemoKeys.add(phone);
            demoCompleted++;
            const matchedContact = demoRequestedByPhone.get(phone);
            console.log("Match found - Phone:", phone, "Status:", mapped.demoStatus, "Contact:", matchedContact?.name || "");
            matchedContacts.push({
              phone,
              name: matchedContact?.name || "",
              timestamp: matchedContact?.timestamp || "",
              demoRequested: matchedContact?.demoRequested,
              demoCompletedStatus: mapped.demoStatus,
            });
          }
        }
      });

      // Step 3: Calculate conversion rate based on demo requested vs completed
      demoConversionRate =
        totalDemoRequestedContacts > 0
          ? Math.round((demoCompleted / totalDemoRequestedContacts) * 100)
          : 0;

      console.log(
        `Final calculation: ${demoCompleted} completed out of ${totalDemoRequestedContacts} requested = ${demoConversionRate}%`
      );
      console.log("Matched contacts (Demo Requested = Yes AND Demo Completed = Yes):", matchedContacts);
    }

    const languageCount = {};
    const contactsByDate = {};

    // Process each contact from real API data
    stats.contacts.forEach((contact, index) => {
      // Debug individual contacts
      if (index < 5) console.log(`Contact ${index}:`, contact);

      const date = new Date(contact.timestamp);
      const day = date.getDate();

      if (!contactsByDate[day]) {
        contactsByDate[day] = {
          day: day,
          totalContacts: 0,
          demoRequested: 0,
          demoNo: 0,
          demoCompleted: 0,
        };
      }

      // Count total contacts per day
      contactsByDate[day].totalContacts += 1;

      // Count demo requests per day
      const dr =
        typeof contact.demoRequested === "string"
          ? contact.demoRequested.toLowerCase().trim()
          : contact.demoRequested;
      const isDemoRequested = dr === "yes" || dr === "y" || dr === true;
      if (isDemoRequested) {
        contactsByDate[day].demoRequested += 1;

        // Check completion via mapping for RAW phone
        const phone = getRawPhone(contact.number || contact.phone || contact.phoneNumber || contact.contact || "");
        const mapped = phoneNumberMapping[phone];
        if (mapped && mapped.isCompleted) {
          contactsByDate[day].demoCompleted += 1;
        }
      } else {
        contactsByDate[day].demoNo += 1;
      }

      // Process language data
      let language = contact.language || "";
      if (language === "Not Selected" || language.trim() === "" || !language) {
        language = "Other";
      }

      if (!languageCount[language]) {
        languageCount[language] = 0;
      }
      languageCount[language] += 1;

      if (!contactsByDate[day][language]) {
        contactsByDate[day][language] = 0;
      }
      contactsByDate[day][language] += 1;
    });

    console.log("Processed contacts by date:", contactsByDate); // Debug log

    const sortedLanguages = Object.entries(languageCount)
      .sort(([, a], [, b]) => b - a)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    const dailyData = Object.values(contactsByDate)
      .sort((a, b) => a.day - b.day)
      .map((day) => {
        const processedDay = {
          ...day,
          conversionRate:
            day.totalContacts > 0
              ? (day.demoRequested / day.totalContacts) * 100
              : 0,
          demoConversionRate:
            day.demoRequested > 0
              ? (day.demoCompleted / day.demoRequested) * 100
              : 0,
        };

        Object.keys(sortedLanguages).forEach((lang) => {
          if (!processedDay[lang]) {
            processedDay[lang] = 0;
          }
        });

        return processedDay;
      });

    console.log("Final daily data for chart:", dailyData); // Debug log
    console.log("Demo completed count:", demoCompleted); // Debug log

    // Find the most used language
    const mostUsedLanguage = Object.entries(sortedLanguages)[0] || [
      "English",
      0,
    ];

    return {
      totalContacts,
      demoRequested,
      demoNo,
      demoCompleted,
      demoConversionRate,
      languages: sortedLanguages,
      conversionRate,
      dailyData, // This is the real-time data used in the chart
      avgDailyContacts: Math.round(
        totalContacts / Math.max(dailyData.length, 1)
      ),
      avgDailyDemos: Math.round(demoRequested / Math.max(dailyData.length, 1)),
      mostUsedLanguage: mostUsedLanguage,
    };
  }, [stats, demoStatusData]);

  const StatCard = ({ title, value, className = "" }) => (
    <div
      className={`bg-white text-gray-800 p-3 rounded-lg shadow-md border border-gray-200 ${className}`}
    >
      <h3 className="text-xs font-medium mb-1 text-gray-600 uppercase">
        {title}
      </h3>
      <div className="text-xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );

  // OPTIMIZED: Show skeleton instead of spinner when data exists but loading
  const LoadingState = () => {
    if (stats && loading) {
      // Show current data with subtle loading indicator
      return (
        <div className="relative">
          <div className="absolute top-4 right-4 z-10">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent bg-white shadow-lg"></div>
          </div>
          <div className="opacity-75">
            {/* Render current data with reduced opacity */}
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  };

  const currentSpreadsheetId = getSpreadsheetId(month);

  if (loading && !stats) return <LoadingState />;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!processedData) return <div className="p-4">Loading...</div>;

  const [mostUsedLanguage, mostUsedCount] = processedData.mostUsedLanguage;

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            DEPLOYH.AI PERFORMANCE DASHBOARD
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!hideNavButtons && (
            <button
              onClick={handleNavigateToFreeSignup}
              disabled={navigating}
              className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-2 px-3 rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2 text-sm"
            >
              {navigating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Opening...</span>
                </>
              ) : (
                <>
                  <span>Free Signup Dashboard</span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </>
              )}
            </button>
          )}
          <select
            value={month}
            onChange={(e) => {
              const val = e.target.value;
              if (onChangeMonth) onChangeMonth(val);
              debouncedSetMonth(val);
            }}
            className="border px-3 py-2 rounded bg-white text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Show loading overlay when refreshing data */}
      <div className={`${loading && stats ? "relative" : ""}`}>
        {loading && stats && (
          <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-blue-700 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 shadow transform -translate-y-20">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
              <span>Updating...</span>
            </div>
          </div>
        )}

        {/* Top 6 Cards - Main Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            title="Total Contacts"
            value={processedData.totalContacts}
          />
          <StatCard
            title="Demo Requested"
            value={`${processedData.demoRequested} (${processedData.conversionRate}%)`}
          />
          <StatCard
            title="Demo Declined"
            value={`${processedData.demoNo} (${
              100 - processedData.conversionRate
            }%)`}
          />
          <StatCard
            title="Demo Completed"
            value={
              demoStatusData
                ? `${processedData.demoCompleted} (${processedData.demoConversionRate}%)`
                : "No Data"
            }
            className={!demoStatusData ? "text-gray-500" : ""}
          />
          <StatCard
            title="Conversion Rate (Demo)"
            value={
              demoStatusData
                ? `${processedData.demoConversionRate}%`
                : "No Data"
            }
            className={!demoStatusData ? "text-gray-500" : ""}
          />
          <StatCard
            title={`${mostUsedLanguage} Users`}
            value={`${mostUsedCount} (${Math.round(
              (mostUsedCount / processedData.totalContacts) * 100
            )}%)`}
          />
        </div>

        {/* Charts Side by Side on Desktop, Stacked on Mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Daily Lead Generation Chart */}
          <div className="bg-white p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">
              DAILY LEAD GENERATION
            </h3>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={processedData.dailyData}
                  margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12 }}
                    axisLine={{ stroke: "#e5e5e5" }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    axisLine={{ stroke: "#e5e5e5" }}
                  />
                  <Bar
                    dataKey="totalContacts"
                    fill="#93c5fd"
                    name="Total Contacts"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="demoRequested"
                    fill="#86efac"
                    name="Demo Requested"
                    radius={[2, 2, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-300 mr-1 rounded-sm"></div>
                <span>Total Contacts</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-300 mr-1 rounded-sm"></div>
                <span>Demo Requested</span>
              </div>
            </div>
          </div>

          {/* Daily Language Distribution Chart */}
          <div className="bg-white p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">
              DAILY LANGUAGE DISTRIBUTION
            </h3>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={processedData.dailyData}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12 }}
                    axisLine={{ stroke: "#e5e5e5" }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    axisLine={{ stroke: "#e5e5e5" }}
                  />
                  {Object.keys(processedData.languages).map((language) => (
                    <Bar
                      key={language}
                      dataKey={language}
                      stackId="a"
                      fill={languageColors[language] || languageColors["Other"]}
                      name={language}
                      radius={
                        language === Object.keys(processedData.languages)[0]
                          ? [2, 2, 0, 0]
                          : [0, 0, 0, 0]
                      }
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2 text-xs max-h-16 overflow-y-auto">
              {Object.entries(processedData.languages)
                .slice(0, 8)
                .map(([language, count]) => (
                  <div key={language} className="flex items-center">
                    <div
                      className="w-3 h-3 mr-1 rounded-sm"
                      style={{
                        backgroundColor:
                          languageColors[language] || languageColors["Other"],
                      }}
                    ></div>
                    <span>
                      {language} ({count})
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      {stats?.metadata && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Processed sheets: {stats.metadata.totalSheetsProcessed} • Rows
          processed: {stats.metadata.totalRowsProcessed}
        </div>
      )}
    </div>
  );
}
